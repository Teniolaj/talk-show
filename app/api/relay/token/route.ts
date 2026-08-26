import { NextResponse } from "next/server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { issueRelayToken } from "@/lib/relay-token";
import { isRateLimited } from "@/lib/rate-limit";

// Deepgram nova-3's Keyterm Prompting accepts a combined budget of ~500
// tokens across all keyterms — capping the vocabulary well under that keeps
// us safe regardless of how many documents/headings a talk show has.
const MAX_KEYTERMS = 50;

export async function POST(request: Request) {
  if (!process.env.RELAY_AUTH_SECRET) {
    return NextResponse.json({ error: "Missing RELAY_AUTH_SECRET" }, { status: 500 });
  }

  const authClient = await getSupabaseServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (isRateLimited(`relay-token:${user.id}`, 10, 10_000)) {
    return NextResponse.json({ error: "Too many requests — slow down" }, { status: 429 });
  }

  const { talkShowId } = (await request.json()) as { talkShowId?: string };
  if (!talkShowId) {
    return NextResponse.json({ error: "talkShowId is required" }, { status: 400 });
  }

  const talkShows = (user.user_metadata?.talkShows ?? []) as Array<{
    id: string;
    documentIds?: string[];
  }>;
  const talkShow = talkShows.find((show) => show.id === talkShowId);
  if (!talkShow) {
    return NextResponse.json({ error: "Talk show not found" }, { status: 404 });
  }

  const keyterms = await getKeyterms(user.id, talkShow.documentIds ?? []);

  return NextResponse.json({ token: issueRelayToken(user.id, talkShowId, keyterms) });
}

// Builds the vocabulary Deepgram should bias toward for this session, drawn
// from the talk show's own content — headings first (most specific), then
// topic tags — so accented/mispronounced domain terms still transcribe
// correctly. Best-effort: an empty/failed lookup just means no keyterm boost.
async function getKeyterms(userId: string, documentIds: string[]): Promise<string[]> {
  if (documentIds.length === 0) return [];

  const supabase = getSupabaseServerClient();
  const { data: chunks } = await supabase
    .from("repo_chunks")
    .select("heading, topic_tags")
    .eq("repo_id", userId)
    .in("document_id", documentIds);

  const terms = new Set<string>();
  for (const chunk of chunks ?? []) {
    if (chunk.heading) terms.add(chunk.heading);
    for (const tag of chunk.topic_tags ?? []) terms.add(tag);
  }

  return Array.from(terms).slice(0, MAX_KEYTERMS);
}
