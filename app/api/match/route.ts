import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// Hardcoded for today's demo loop — see AGENTS.md / build doc for why.
const REPO_ID = "00000000-0000-0000-0000-000000000001";
const DOCUMENT_ID = "1fc77b63-9dba-4e8d-9494-9ac6341ae655";

// Tuned from live testing: gemini-embedding-001 at 1536 dims puts genuinely
// relevant chunks around 0.6-0.77 cosine similarity and off-topic ones around
// 0.43-0.46 for this corpus — 0.75 (the naive starting guess) was too strict
// and rejected real matches.
const SEMANTIC_THRESHOLD = 0.6;
const EMBED_DIMENSIONS = 1536;

type Chunk = {
  id: string;
  content: string;
  topic_tags: string[] | null;
  embedding: string | number[] | null;
};

type MatchResult = {
  tier: "keyword" | "semantic" | null;
  content: string | null;
  similarity?: number;
  matchedTags?: string[];
};

function extractWords(transcript: string): string[] {
  const words = transcript
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return Array.from(new Set(words));
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

async function embedTranscript(transcript: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text: transcript }] },
        outputDimensionality: EMBED_DIMENSIONS,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini embedding request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.embedding.values as number[];
}

export async function POST(request: Request) {
  const { transcript } = (await request.json()) as { transcript?: string };

  if (!transcript || !transcript.trim()) {
    return NextResponse.json({ tier: null, content: null } satisfies MatchResult);
  }

  const supabase = getSupabaseServerClient();

  // Keyword tier: cheap, instant, trusted if it hits.
  const words = extractWords(transcript);
  if (words.length > 0) {
    const { data: keywordHits } = await supabase
      .from("repo_chunks")
      .select("id, content, topic_tags")
      .eq("repo_id", REPO_ID)
      .eq("document_id", DOCUMENT_ID)
      .overlaps("topic_tags", words);

    if (keywordHits && keywordHits.length > 0) {
      const hit = keywordHits[0];
      const matchedTags = (hit.topic_tags ?? []).filter((tag: string) =>
        words.includes(tag.toLowerCase())
      );
      return NextResponse.json({
        tier: "keyword",
        content: hit.content,
        matchedTags,
      } satisfies MatchResult);
    }
  }

  // Semantic tier: embed and compare against stored chunk embeddings.
  const queryEmbedding = await embedTranscript(transcript);

  const { data: chunks } = await supabase
    .from("repo_chunks")
    .select("id, content, topic_tags, embedding")
    .eq("repo_id", REPO_ID)
    .eq("document_id", DOCUMENT_ID);

  let best: { content: string; similarity: number } | null = null;
  for (const chunk of (chunks ?? []) as Chunk[]) {
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
      content: best.content,
      similarity: best.similarity,
    } satisfies MatchResult);
  }

  return NextResponse.json({ tier: null, content: null } satisfies MatchResult);
}
