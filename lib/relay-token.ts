import { createHmac } from "crypto";

// Short-lived token the browser exchanges for permission to open a live
// WebSocket session on the relay server. Signed with RELAY_AUTH_SECRET, a
// secret shared only between this server and relay/server.js — never sent
// to the browser directly, so a client can't mint its own tokens or reuse
// one past its expiry to keep burning Deepgram minutes.
const TOKEN_TTL_MS = 60_000;

function getSecret(): string {
  const secret = process.env.RELAY_AUTH_SECRET;
  if (!secret) throw new Error("Missing RELAY_AUTH_SECRET");
  return secret;
}

export function issueRelayToken(userId: string, talkShowId: string, keyterms: string[] = []): string {
  const payload = JSON.stringify({ uid: userId, tsid: talkShowId, kt: keyterms, exp: Date.now() + TOKEN_TTL_MS });
  const payloadEncoded = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", getSecret()).update(payloadEncoded).digest("base64url");
  return `${payloadEncoded}.${signature}`;
}
