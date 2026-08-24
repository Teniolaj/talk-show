import { NextResponse } from "next/server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { issueRelayToken } from "@/lib/relay-token";
import { isRateLimited } from "@/lib/rate-limit";

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

  const talkShows = (user.user_metadata?.talkShows ?? []) as Array<{ id: string }>;
  if (!talkShows.some((show) => show.id === talkShowId)) {
    return NextResponse.json({ error: "Talk show not found" }, { status: 404 });
  }

  return NextResponse.json({ token: issueRelayToken(user.id, talkShowId) });
}
