import { NextResponse } from "next/server";
import Fuse from "fuse.js";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/gemini-embed";
import { isRateLimited } from "@/lib/rate-limit";
import type { MatchResult } from "@/lib/match-types";

// A live session checks roughly once per finalized speech segment, so this
// comfortably covers real usage while blocking a script from hammering the
// endpoint and running up the Gemini embedding bill.
const MATCH_RATE_LIMIT = 20;
const MATCH_RATE_WINDOW_MS = 10_000;

// Tuned from live testing: gemini-embedding-001 at 1536 dims puts genuinely
// relevant chunks around 0.6-0.77 cosine similarity and off-topic ones around
// 0.43-0.46 for this corpus — 0.75 (the naive starting guess) was too strict
// and rejected real matches.
const SEMANTIC_THRESHOLD = 0.6;

// Fuse.js scores 0 (exact) to 1 (no match) — lower is better. Starting points,
// not measured yet: 0.3 for single-word keyword/tag fuzzing (tolerate a typo
// or near-miss transcription of one word), 0.4 for the command tier since it
// matches a fuller phrase against a heading and has more room to drift.
const KEYWORD_FUZZY_THRESHOLD = 0.3;
const COMMAND_FUZZY_THRESHOLD = 0.4;

// The one required trigger for explicit slide selection. Deliberately a
// single literal phrase rather than a list of paraphrases — kept predictable
// for the presenter to rely on. Matches anywhere in the segment, so natural
// filler before it ("I'm talking about slide on pricing") works for free.
const SLIDE_COMMAND_PATTERN = /\bslide on\s+(.+)/i;

type Chunk = {
  id: string;
  content: string;
  topic_tags: string[] | null;
  heading: string | null;
};

type ChunkWithEmbedding = {
  id: string;
  content: string;
  topic_tags: string[] | null;
  embedding: string | number[] | null;
};

function extractWords(transcript: string): string[] {
  const words = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return Array.from(new Set(words));
}

function extractSlideCommandPhrase(transcript: string): string | null {
  const match = transcript.match(SLIDE_COMMAND_PATTERN);
  if (!match?.[1]) return null;
  const phrase = match[1].replace(/[.?!]+$/, "").trim();
  return phrase.length >= 2 ? phrase : null;
}

function parseEmbedding(embedding: string | number[] | null): number[] | null {
  if (!embedding) return null;
  if (Array.isArray(embedding)) return embedding;
  try {
    return JSON.parse(embedding);
  } catch {
    return null;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function POST(request: Request) {
  const { transcript, talkShowId } = (await request.json()) as {
    transcript?: string;
    talkShowId?: string;
  };

  if (!transcript || !transcript.trim()) {
    return NextResponse.json({ tier: null, kind: "auto", content: null } satisfies MatchResult);
  }

  if (!talkShowId) {
    return NextResponse.json({ error: "talkShowId is required" }, { status: 400 });
  }

  const authClient = await getSupabaseServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (isRateLimited(`match:${user.id}`, MATCH_RATE_LIMIT, MATCH_RATE_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many match requests — slow down" }, { status: 429 });
  }

  const talkShows = (user.user_metadata?.talkShows ?? []) as Array<{
    id: string;
    documentIds?: string[];
  }>;
  const talkShow = talkShows.find((show) => show.id === talkShowId);
  if (!talkShow) {
    return NextResponse.json({ error: "Talk show not found" }, { status: 404 });
  }

  const documentIds = talkShow.documentIds ?? [];
  if (documentIds.length === 0) {
    return NextResponse.json({ tier: null, kind: "auto", content: null } satisfies MatchResult);
  }

  const supabase = getSupabaseServerClient();

  const commandPhrase = extractSlideCommandPhrase(transcript);

  // Tier 0 + 1 share one fetch: fuzzy lookup only needs content/tags/heading,
  // not the (much heavier) embedding column.
  const { data: chunks } = await supabase
    .from("repo_chunks")
    .select("id, content, topic_tags, heading")
    .eq("repo_id", user.id)
    .in("document_id", documentIds);

  const scopedChunks = (chunks ?? []) as Chunk[];

  // Tier 0: explicit "slide on X" command — trusted above everything else,
  // and never falls through to auto-detection even on a miss, since showing
  // unrelated auto-matched content right after an explicit ask is worse than
  // showing nothing.
  if (commandPhrase) {
    const commandFuse = new Fuse(scopedChunks, {
      keys: [
        { name: "heading", weight: 0.7 },
        { name: "topic_tags", weight: 0.3 },
      ],
      threshold: COMMAND_FUZZY_THRESHOLD,
      ignoreLocation: true,
    });

    const [best] = commandFuse.search(commandPhrase);
    if (best) {
      return NextResponse.json({
        tier: "command",
        kind: "command",
        content: best.item.content,
        matchedHeading: best.item.heading ?? undefined,
        commandPhrase,
      } satisfies MatchResult);
    }

    return NextResponse.json({
      tier: null,
      kind: "command",
      content: null,
      commandPhrase,
    } satisfies MatchResult);
  }

  // Tier 1: fuzzy keyword/tag/heading match — cheap, near-instant, tolerant
  // of a mispronounced or reworded word instead of requiring an exact hit.
  const words = extractWords(transcript);
  if (words.length > 0 && scopedChunks.length > 0) {
    const keywordFuse = new Fuse(scopedChunks, {
      keys: ["topic_tags", "heading"],
      threshold: KEYWORD_FUZZY_THRESHOLD,
      minMatchCharLength: 3,
      ignoreLocation: true,
      includeMatches: true,
    });

    let bestHit: { item: Chunk; score: number; matchedTags: string[] } | null = null;
    for (const word of words) {
      const results = keywordFuse.search(word);
      const [top] = results;
      if (!top || typeof top.score !== "number") continue;
      if (!bestHit || top.score < bestHit.score) {
        const matchedTags = (top.item.topic_tags ?? []).filter((tag) =>
          (top.matches ?? []).some((m) => m.key === "topic_tags" && m.value === tag)
        );
        bestHit = { item: top.item, score: top.score, matchedTags };
      }
    }

    if (bestHit) {
      return NextResponse.json({
        tier: "keyword",
        kind: "auto",
        content: bestHit.item.content,
        matchedTags: bestHit.matchedTags,
      } satisfies MatchResult);
    }
  }

  // Tier 2: semantic — embed and compare against stored chunk embeddings.
  // Separate (heavier) fetch since it needs the embedding column, only run
  // when tiers 0-1 both miss.
  const queryEmbedding = await embedText(transcript);

  const { data: chunksWithEmbeddings } = await supabase
    .from("repo_chunks")
    .select("id, content, topic_tags, embedding")
    .eq("repo_id", user.id)
    .in("document_id", documentIds);

  let best: { content: string; similarity: number } | null = null;
  for (const chunk of (chunksWithEmbeddings ?? []) as ChunkWithEmbedding[]) {
    const embedding = parseEmbedding(chunk.embedding);
    if (!embedding) continue;
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (!best || similarity > best.similarity) {
      best = { content: chunk.content, similarity };
    }
  }

  console.log(`[match] segment="${transcript}" bestSimilarity=${best?.similarity.toFixed(4)} threshold=${SEMANTIC_THRESHOLD}`);

  if (best && best.similarity >= SEMANTIC_THRESHOLD) {
    return NextResponse.json({
      tier: "semantic",
      kind: "auto",
      content: best.content,
      similarity: best.similarity,
    } satisfies MatchResult);
  }

  return NextResponse.json({ tier: null, kind: "auto", content: null } satisfies MatchResult);
}
