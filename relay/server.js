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

wss.on('connection', (clientSocket) => {
  console.log('[client] connected');

  // Open a live transcription connection to Deepgram for this session.
  // No encoding/sample_rate specified — the browser sends a WebM/Opus
  // container, and Deepgram auto-detects format from container audio.
  const dgConnection = deepgram.listen.live({
    model: 'nova-3',
    language: 'en',
    smart_format: true,
    interim_results: true,
  });

  // Registered up front, not nested inside Open — an `error` emitted before
  // Open (or racing it) had no listener yet and crashed the process, since
  // Node throws on unhandled EventEmitter 'error' events.
  let dgOpen = false;
  let pendingChunks = [];

  dgConnection.on(LiveTranscriptionEvents.Open, () => {
    console.log(`[deepgram] connection opened, flushing ${pendingChunks.length} buffered chunk(s)`);
    dgOpen = true;
    for (const chunk of pendingChunks) {
      dgConnection.send(chunk);
    }
    pendingChunks = [];
  });

  dgConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (transcript && transcript.trim().length > 0) {
      clientSocket.send(
        JSON.stringify({
          transcript,
          is_final: data.is_final,
        })
      );
    }
  });

  dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error('[deepgram] error', err);
  });

  dgConnection.on(LiveTranscriptionEvents.Close, (event) => {
    console.log('[deepgram] connection closed', event?.code, event?.reason);
  });

  clientSocket.on('message', (audioChunk) => {
    // The very first chunk carries the WebM container's header — dropping
    // it (as this used to do while waiting for Deepgram's socket to open)
    // leaves every later chunk undecodable, since they're header-less
    // continuation fragments. Buffer instead of dropping, flush on Open.
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
