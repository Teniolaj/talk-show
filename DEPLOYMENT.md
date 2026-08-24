# Deploying Talkshow: Relay on Render + Frontend on Vercel

The relay server (`relay/`) needs to run as a persistent process, so it can't live on Vercel (serverless functions don't support long-lived WebSocket connections). Render hosts it instead. The relay is deployment-ready as-is:

- `relay/server.js` reads `process.env.PORT`, which Render injects automatically.
- The frontend resolves its WebSocket URL from `NEXT_PUBLIC_RELAY_WS_URL` in both `app/live/page.tsx` and `app/display/page.tsx`, falling back to `ws://localhost:3001` only when that env var is unset.

So this is almost entirely configuration, not code changes.

## 1. Relay on Render — ✅ done

Deployed at **`https://talk-show.onrender.com`**. Verified live: `HTTP 200` on the base route, and the WebSocket upgrade handshake returns `101 Switching Protocols`.

Config used:
- Root Directory: `relay`
- Build Command: `npm install` (not the Render-suggested default `npm install; npm run build` — this app has no build step)
- Start Command: `npm start`
- Env var: `DEEPGRAM_API_KEY`

## 2. Deploy the Next.js app to Vercel — next step

1. Go to [vercel.com/new](https://vercel.com/new) → import the `talk-show` GitHub repo.
2. **Root Directory**: repo root (default) — *not* `relay`, that's the separate Render service.
3. Framework preset should auto-detect as Next.js.
4. Set these environment variables (copy actual values from local `.env.local`, don't retype by hand):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | from `.env.local` |
| `GEMINI_API_KEY` | from `.env.local` |
| `N8N_INGEST_WEBHOOK_URL` | from `.env.local` |
| `NEXT_PUBLIC_RELAY_WS_URL` | `wss://talk-show.onrender.com` |

5. Deploy. Vercel gives a URL like `https://talk-show-xyz.vercel.app`.

## 3. Update Supabase Auth's URL allow-list for the production domain

Easy to miss, causes "login works locally, breaks in prod": Supabase Dashboard → **Authentication → URL Configuration**:

- Set **Site URL** to the new Vercel URL.
- Add `https://<your-vercel-domain>/auth/callback` to **Redirect URLs**.

## 4. Test end-to-end

1. Open the deployed app and sign in.
2. Start a live session; check Render's logs for `[client] connected: live` to confirm the browser reached the relay.
3. Open `/display` on a second tab/device; confirm `[display] connected` too.

## Local development: do you still need to run the relay locally?

**No, not anymore.** Add the same line to your local `.env.local`:

```
NEXT_PUBLIC_RELAY_WS_URL=wss://talk-show.onrender.com
```

`npm run dev` will then talk to the deployed relay instead of `localhost:3001` — no `node server.js` needed locally. Leave that line out (or comment it) if you want isolated local-only testing instead; the fallback to `ws://localhost:3001` still works.

**Caveat**: `relay/server.js` keeps `displayClients` and `latestDisplay` as global in-memory state for the whole process — not scoped per user or session. If you test locally against the deployed relay while someone else is also using it live, your `/display` view and theirs will show whatever was broadcast most recently, cross-contaminating. Fine solo, worth knowing once more than one person uses it.

## Known trade-off: cold starts on Render's free tier

Render's free tier spins the service down after ~15 minutes idle. The *first* connection after a gap takes 30–60s to cold-start. During an actual live presentation, a presenter clicking "Start Session" after a gap may sit on "Connecting…" briefly.

Worth the cheapest paid tier ($7/mo "Starter") for real use rather than a demo/class project — it keeps the service warm.

## Also worth doing (not covered here)

The n8n ingestion webhook is still on the **test** URL (`/webhook-test/...`), which only responds once per manual "Listen for test event" click in the n8n editor. For uploads to work without manually arming it every time, activate the workflow in n8n and switch `N8N_INGEST_WEBHOOK_URL` (in both `.env.local` and Vercel's env vars) to the production path (`/webhook/...`).
