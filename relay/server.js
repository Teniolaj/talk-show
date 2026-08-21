require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

if (!process.env.DEEPGRAM_API_KEY) {
  console.error('Missing DEEPGRAM_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const displayClients = new Set();
let latestDisplay = null;

function broadcastDisplay(message) {
  latestDisplay = { type: 'display', ...message };

  for (const client of displayClients) {
    if (client.readyState === 1) {
      client.send(JSON.stringify(latestDisplay));
    }
  }
}

wss.on('connection', (clientSocket, request) => {
  const url = new URL(
    request.url,
    `http://${request.headers.host}`
  );

  const clientType = url.searchParams.get('type');

  console.log(`[client] connected: ${clientType || 'unknown'}`);

  // Display clients only receive detected content.
if (clientType === 'display') {
  displayClients.add(clientSocket);

  console.log('[display] connected');

  if (latestDisplay) {
    clientSocket.send(JSON.stringify(latestDisplay));
  }

  clientSocket.on('close', () => {
    displayClients.delete(clientSocket);
    console.log('[display] disconnected');
  });

  return;
}

  // Live clients handle microphone audio + Deepgram.
  const dgConnection = deepgram.listen.live({
    model: 'nova-3',
    language: 'en',
    smart_format: true,
    interim_results: true,
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

      if (message.type === 'display' && typeof message.content === 'string') {
        broadcastDisplay({
          title: typeof message.title === 'string' ? message.title : 'Detected information',
          content: message.content,
          source: typeof message.source === 'string' ? message.source : undefined,
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
    console.log('[client] disconnected');

    dgConnection.finish();
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
