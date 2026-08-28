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
const SLIDE_COMMAND_TRIGGER = /\bslides? on\s+/gi;
const BIBLE_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
].sort((a, b) => b.length - a.length);

type Chunk = {
  id: string;
  document_id: string;
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
  // The caller's rolling transcript buffer can contain more than one "slide
  // on X" command when several are said in quick succession without a long
  // enough pause to reset the buffer (see recentTranscriptRef in
  // app/live/page.tsx). Find the LAST trigger occurrence (matching only the
  // "slide(s) on " words themselves, not a greedy rest-of-string capture —
  // that would consume everything on the first match and prevent finding a
  // later one) so a newer command always supersedes an older one still
  // sitting in the buffer.
  SLIDE_COMMAND_TRIGGER.lastIndex = 0;
  let lastTriggerEnd: number | null = null;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_COMMAND_TRIGGER.exec(transcript)) !== null) {
    lastTriggerEnd = match.index + match[0].length;
  }
  if (lastTriggerEnd === null) return null;

  // Bound the phrase to the current sentence/clause. The rolling transcript
  // buffer this receives can contain unrelated speech said after the
  // command (including a second, punctuation-broken "slide on" attempt that
  // didn't match the trigger above), which shouldn't be folded into the
  // heading being searched for.
  const afterTrigger = transcript.slice(lastTriggerEnd);
  const sentenceEndIndex = afterTrigger.search(/[.?!]/);
  const rawPhrase = sentenceEndIndex === -1 ? afterTrigger : afterTrigger.slice(0, sentenceEndIndex);
  const phrase = rawPhrase.trim();
  return phrase.length >= 2 ? phrase : null;
}

function normalizeForHeading(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findMentionedHeading(transcript: string, chunks: Chunk[]): Chunk | null {
  const normalizedTranscript = normalizeForHeading(transcript);
  const uniqueHeadings = new Set<string>();

  for (const chunk of chunks) {
    const heading = chunk.heading?.trim();
    if (!heading) continue;
    const normalizedHeading = normalizeForHeading(heading);
    const genericHeading = /^(?:untitled|presentation|slide\s*\d*)$/.test(normalizedHeading);
    // Exact whole-heading mentions work for both a one-word PDF section such
    // as "Conclusion" and a full slide title, while ignoring deck chrome.
    if (
      normalizedHeading.length >= 3 &&
      !genericHeading &&
      ` ${normalizedTranscript} `.includes(` ${normalizedHeading} `)
    ) {
      uniqueHeadings.add(heading);
    }
  }

  if (uniqueHeadings.size !== 1) return null;
  return chunks.find((chunk) => chunk.heading === [...uniqueHeadings][0]) ?? null;
}

type BibleReference = { book: string; chapter: string; verse: string };

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBibleReference(transcript: string): BibleReference | null {
  const books = BIBLE_BOOKS.map(escapeRegExp).join("|");
  const match = transcript.match(new RegExp(`\\b(${books})\\s+(\\d{1,3})(?:\\s*[:.]\\s*|\\s+)(\\d{1,3})\\b`, "i"));
  if (!match) return null;
  const book = BIBLE_BOOKS.find((candidate) => candidate.toLowerCase() === match[1].toLowerCase()) ?? match[1];
  return { book, chapter: match[2], verse: match[3] };
}

function verseFromChunk(content: string, reference: BibleReference): string {
  const verseLine = new RegExp(`(?:^|\\n)\\s*${reference.verse}[.:)]?\\s+([\\s\\S]*?)(?=\\n\\s*\\d{1,3}[.:)]?\\s+|$)`, "m").exec(content);
  if (!verseLine?.[1]) return content;
  return `${reference.book} ${reference.chapter}:${reference.verse}\n${verseLine[1].trim()}`;
}

function findBibleVerse(reference: BibleReference, chunks: Chunk[]): { chunk: Chunk; content: string } | null {
  const bookPattern = escapeRegExp(reference.book).replace(/ /g, "\\s+");
  const fullReference = new RegExp(`\\b${bookPattern}\\s+${reference.chapter}\\s*[:.]?\\s*${reference.verse}\\b`, "i");
  const chapterReference = new RegExp(`\\b${bookPattern}\\s+${reference.chapter}\\b`, "i");
  const verseMarker = new RegExp(`(?:^|\\n)\\s*${reference.verse}[.:)]?\\s+`, "m");

  const exact = chunks.find((chunk) => fullReference.test(`${chunk.heading ?? ""}\n${chunk.content}`));
  if (exact) return { chunk: exact, content: verseFromChunk(exact.content, reference) };

  const chapterChunk = chunks.find(
    (chunk) => chapterReference.test(chunk.heading ?? "") && verseMarker.test(chunk.content)
  );
  return chapterChunk ? { chunk: chapterChunk, content: verseFromChunk(chapterChunk.content, reference) } : null;
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

function fullSlideContent(selectedChunk: Chunk, chunks: Chunk[]): string {
  const heading = selectedChunk.heading?.trim();
  if (!heading) return selectedChunk.content;

  // A longer slide can be stored as more than one chunk. Keep all chunks for
  // the same document + heading together so an explicit command displays the
  // complete slide, rather than whichever fragment Fuse happened to return.
  const slideChunks = chunks.filter(
    (chunk) => chunk.document_id === selectedChunk.document_id && chunk.heading?.trim() === heading
  );
  return slideChunks.map((chunk) => chunk.content.trim()).filter(Boolean).join("\n\n");
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
    .select("id, document_id, content, topic_tags, heading")
    .eq("repo_id", user.id)
    .in("document_id", documentIds);

  const scopedChunks = (chunks ?? []) as Chunk[];
  const bibleReference = parseBibleReference(commandPhrase ?? transcript);

  if (bibleReference) {
    const verse = findBibleVerse(bibleReference, scopedChunks);
    if (verse) {
      const title = `${bibleReference.book} ${bibleReference.chapter}:${bibleReference.verse}`;
      return NextResponse.json({
        tier: "command",
        kind: "command",
        content: verse.content,
        matchedHeading: title,
        commandPhrase: commandPhrase ?? title,
      } satisfies MatchResult);
    }
  }

  // Tier 0: explicit "slide on X" command — trusted above everything else,
  // and never falls through to auto-detection even on a miss, since showing
  // unrelated auto-matched content right after an explicit ask is worse than
  // showing nothing.
  if (commandPhrase) {
    if (scopedChunks.length === 0) {
      return NextResponse.json({
        tier: null,
        kind: "command",
        content: null,
        commandPhrase,
        message: "No ingested content was found in this talk show's selected library.",
      } satisfies MatchResult);
    }

    if (!scopedChunks.some((chunk) => chunk.heading?.trim())) {
      return NextResponse.json({
        tier: null,
        kind: "command",
        content: null,
        commandPhrase,
        message: "This document has no slide headings yet. Re-ingest it with the slide-heading workflow enabled.",
      } satisfies MatchResult);
    }

    const commandFuse = new Fuse(scopedChunks, {
      keys: [
        { name: "heading", weight: 0.7 },
        { name: "topic_tags", weight: 0.3 },
      ],
      threshold: COMMAND_FUZZY_THRESHOLD,
      ignoreLocation: true,
      includeScore: true,
    });

    const [best, runnerUp] = commandFuse.search(commandPhrase);
    if (best) {
      // With several documents selected, headings/tags from every one of
      // them are pooled into this one search — a strong match from the
      // wrong document can score nearly as well as the right slide. Only
      // trust the top hit when it's a clear winner; otherwise a confident
      // wrong guess is worse than asking the presenter to be more specific.
      const isSameSlide =
        runnerUp?.item.document_id === best.item.document_id &&
        runnerUp?.item.heading?.trim() === best.item.heading?.trim();
      // A near-literal heading match (e.g. saying "Closing" for a slide
      // titled exactly "Closing") should win outright even if a merely
      // similar heading exists elsewhere (e.g. "Closing Remarks" in another
      // document) — the presenter said the real heading almost verbatim.
      const isNearExactMatch = typeof best.score === "number" && best.score < 0.02;
      const isCloseCompetitor =
        !isNearExactMatch &&
        runnerUp &&
        !isSameSlide &&
        typeof runnerUp.score === "number" &&
        typeof best.score === "number" &&
        runnerUp.score - best.score < 0.05;

      if (isCloseCompetitor) {
        return NextResponse.json({
          tier: null,
          kind: "command",
          content: null,
          commandPhrase,
          message: `“${commandPhrase}” matches more than one slide (e.g. “${best.item.heading}” and “${runnerUp.item.heading}”) — say the heading more precisely.`,
        } satisfies MatchResult);
      }

      return NextResponse.json({
        tier: "command",
        kind: "command",
        content: fullSlideContent(best.item, scopedChunks),
        matchedHeading: best.item.heading ?? undefined,
        commandPhrase,
      } satisfies MatchResult);
    }

    return NextResponse.json({
      tier: null,
      kind: "command",
      content: null,
      commandPhrase,
      message: `No slide heading matched “${commandPhrase}”. Try the heading as it appears in the presentation.`,
    } satisfies MatchResult);
  }

  // A presenter does not always use the command wording. An unambiguous,
  // natural mention of a stored slide title (e.g. "now, technology and
  // productivity") should bring up that slide too.
  const mentionedHeading = findMentionedHeading(transcript, scopedChunks);
  if (mentionedHeading) {
    return NextResponse.json({
      tier: "keyword",
      kind: "auto",
      content: fullSlideContent(mentionedHeading, scopedChunks),
      matchedHeading: mentionedHeading.heading ?? undefined,
      matchedTags: [mentionedHeading.heading ?? "Slide"],
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
