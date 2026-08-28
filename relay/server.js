require('dotenv').config();

const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

if (!process.env.DEEPGRAM_API_KEY) {
  console.error('Missing DEEPGRAM_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

if (!process.env.RELAY_AUTH_SECRET) {
  console.error('Missing RELAY_AUTH_SECRET. Copy .env.example to .env and set it to the same value as the Next.js app.');
  process.exit(1);
}

const RELAY_AUTH_SECRET = process.env.RELAY_AUTH_SECRET;
const MAX_CONCURRENT_LIVE_CONNECTIONS = Number(process.env.RELAY_MAX_LIVE_CONNECTIONS || 20);

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// One room per talk show — display clients only ever see the broadcasts
// their own live session sends, instead of every session sharing one global
// "latest detected content" value.
const rooms = new Map();

function getRoom(talkShowId) {
  let room = rooms.get(talkShowId);
  if (!room) {
    room = { displayClients: new Set(), latestDisplay: null };
    rooms.set(talkShowId, room);
  }
  return room;
}

function broadcastDisplay(talkShowId, message) {
  const room = getRoom(talkShowId);
  room.latestDisplay = { type: 'display', ...message };

  for (const client of room.displayClients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(room.latestDisplay));
    }
  }
}

function clearDisplay(talkShowId) {
  const room = getRoom(talkShowId);
  room.latestDisplay = null;

  for (const client of room.displayClients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'clear' }));
    }
  }
}

// Verifies the short-lived token minted by POST /api/relay/token in the
// Next.js app (lib/relay-token.ts). Only someone with a valid Supabase
// session for the owning talk show can get one, and it expires within a
// minute — so this is what stops a stranger from opening a live connection
// directly against the relay and burning Deepgram minutes on our key.
// Returns { payload } on success, or { reason } on failure. Distinguishing
// *why* a token was rejected (expired vs. bad signature vs. malformed) used
// to be thrown away — the client only ever saw a generic "service
// unavailable" close with no explanation. Surfacing the reason makes the
// next occurrence of this actually diagnosable instead of a guessing game.
function verifyRelayToken(token, talkShowId) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return { reason: 'missing-token' };
  }

  const [payloadEncoded, signature] = token.split('.');
  if (!payloadEncoded || !signature) {
    return { reason: 'malformed-token' };
  }

  const expectedSignature = crypto
    .createHmac('sha256', RELAY_AUTH_SECRET)
    .update(payloadEncoded)
    .digest('base64url');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    // Almost always means RELAY_AUTH_SECRET differs between this relay's
    // environment and the Next.js app that issued the token.
    return { reason: 'bad-signature' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
  } catch {
    return { reason: 'malformed-token' };
  }

  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) {
    // Common when the relay was cold (e.g. a sleeping free-tier host waking
    // up) and the WebSocket handshake itself took longer than the token's
    // short TTL to complete.
    return { reason: 'expired-token' };
  }
  if (payload.tsid !== talkShowId) return { reason: 'wrong-talk-show' };

  return { payload };
}

const TOKEN_REJECTION_MESSAGES = {
  'missing-token': 'No session token was sent — try refreshing the page.',
  'malformed-token': 'The session token was malformed — try refreshing the page.',
  'bad-signature': 'The session token could not be verified — the relay and app may be misconfigured. Contact the app owner.',
  'expired-token': 'The connection took too long to establish and the session expired — try going live again.',
  'wrong-talk-show': 'This session token is for a different talk show — try refreshing the page.',
};

let activeLiveConnections = 0;

wss.on('connection', (clientSocket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const clientType = url.searchParams.get('type');
  const talkShowId = url.searchParams.get('talkShowId');

  // Display clients only receive detected content for their talk show.
  if (clientType === 'display') {
    if (!talkShowId) {
      clientSocket.close(4000, 'talkShowId is required');
      return;
    }

    const room = getRoom(talkShowId);
    room.displayClients.add(clientSocket);

    console.log(`[display] connected for talk show ${talkShowId}`);

    if (room.latestDisplay) {
      clientSocket.send(JSON.stringify(room.latestDisplay));
    }

    clientSocket.on('close', () => {
      room.displayClients.delete(clientSocket);
      console.log(`[display] disconnected from talk show ${talkShowId}`);
    });

    return;
  }

  if (clientType !== 'live') {
    clientSocket.close(4003, 'Unknown client type');
    return;
  }

  const token = url.searchParams.get('token');
  const verification = talkShowId
    ? verifyRelayToken(token, talkShowId)
    : { reason: 'missing-talk-show' };
  if (!verification.payload) {
    console.log(`[client] rejected: ${verification.reason}`);
    clientSocket.send(
      JSON.stringify({
        type: 'error',
        message:
          TOKEN_REJECTION_MESSAGES[verification.reason] ||
          'This session could not be authorized — try refreshing the page.',
      })
    );
    clientSocket.close(4001, verification.reason);
    return;
  }
  const tokenPayload = verification.payload;

  if (activeLiveConnections >= MAX_CONCURRENT_LIVE_CONNECTIONS) {
    console.log('[client] rejected: too many concurrent live connections');
    clientSocket.send(
      JSON.stringify({
        type: 'error',
        message: 'Too many people are live right now — try again in a moment.',
      })
    );
    clientSocket.close(4002, 'Too many concurrent sessions');
    return;
  }

  activeLiveConnections++;
  console.log(`[client] connected: live for talk show ${talkShowId} (${activeLiveConnections} active)`);

  // Live clients handle microphone audio + Deepgram.
  const keyterms = Array.isArray(tokenPayload.kt) ? tokenPayload.kt : [];
  const dgConnection = deepgram.listen.live({
    model: 'nova-3',
    language: 'en',
    smart_format: true,
    interim_results: true,
    // Default endpointing (10ms) splits a spoken sentence into multiple
    // "final" segments on the slightest pause; 300ms waits for an actual gap.
    endpointing: 300,
    // Emits a separate UtteranceEnd event marking when a full spoken thought
    // ends, independent of the more aggressive is_final segment splitting —
    // used by the browser to group segments before picking the best match.
    utterance_end_ms: 1000,
    vad_events: true,
    // Biases recognition toward this talk show's own vocabulary (headings +
    // topic tags), so accented/mispronounced domain terms still transcribe
    // correctly. nova-3 only; harmless no-op if the list is empty.
    ...(keyterms.length > 0 ? { keyterm: keyterms } : {}),
  });

  let dgOpen = false;
  let pendingChunks = [];

  const sendToLiveClient = (message) => {
    if (clientSocket.readyState === 1) {
      clientSocket.send(JSON.stringify(message));
    }
  };

  dgConnection.on(LiveTranscriptionEvents.Open, () => {
    console.log(
      `[deepgram] connection opened, flushing ${pendingChunks.length} buffered chunk(s)`
    );

    dgOpen = true;
    sendToLiveClient({ type: 'ready' });

    for (const chunk of pendingChunks) {
      dgConnection.send(chunk);
    }

    pendingChunks = [];
  });

  dgConnection.on(
    LiveTranscriptionEvents.Transcript,
    (data) => {
      const transcript =
        data.channel?.alternatives?.[0]?.transcript;

      if (
        transcript &&
        transcript.trim().length > 0 &&
        clientSocket.readyState === 1
      ) {
        sendToLiveClient({
          type: 'transcript',
          transcript,
          is_final: data.is_final,
        });
      }
    }
  );

  dgConnection.on(
    LiveTranscriptionEvents.UtteranceEnd,
    () => {
      sendToLiveClient({ type: 'utterance_end' });
    }
  );

  dgConnection.on(
    LiveTranscriptionEvents.Error,
    (err) => {
      console.error('[deepgram] error', err);
      sendToLiveClient({
        type: 'error',
        message: 'The transcription provider could not start. Check the Deepgram API key and relay logs.',
      });
    }
  );

  dgConnection.on(
    LiveTranscriptionEvents.Close,
    (event) => {
      console.log(
        '[deepgram] connection closed',
        event?.code,
        event?.reason
      );

      if (!dgOpen) {
        sendToLiveClient({
          type: 'error',
          message: 'The transcription provider closed before the session could start.',
        });
      }
    }
  );

  clientSocket.on('message', (audioChunk) => {
    try {
      const message = JSON.parse(audioChunk.toString());

      if (message.type === 'clear-display') {
        clearDisplay(talkShowId);
        return;
      }

      if (message.type === 'display' && typeof message.content === 'string') {
        broadcastDisplay(talkShowId, {
          title: typeof message.title === 'string' ? message.title : 'Detected information',
          content: message.content,
          source: typeof message.source === 'string' ? message.source : undefined,
          kind: typeof message.kind === 'string' ? message.kind : undefined,
        });
        return;
      }
    } catch {
      // Audio is binary and is expected not to parse as JSON.
    }

    if (dgOpen) {
      dgConnection.send(audioChunk);
    } else {
      pendingChunks.push(audioChunk);
    }
  });

  clientSocket.on('close', () => {
    activeLiveConnections--;
    console.log(`[client] disconnected (${activeLiveConnections} active)`);

    dgConnection.finish();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
