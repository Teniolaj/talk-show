"use client";

import { useRef, useState } from "react";

const RELAY_WS_URL = "ws://localhost:3001";

type MatchResult = {
  tier: "keyword" | "semantic" | null;
  content: string | null;
  similarity?: number;
  matchedTags?: string[];
};

export default function LivePage() {
  const [status, setStatus] = useState("Idle — click Start and allow mic access");
  const [isLive, setIsLive] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  async function checkMatch(segment: string) {
    setMatching(true);
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: segment }),
      });
      const result: MatchResult = await res.json();
      if (result.tier) setMatch(result);
    } catch (err) {
      console.error("match request failed", err);
    } finally {
      setMatching(false);
    }
  }

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("Mic access denied — check browser permissions");
      return;
    }
    mediaStreamRef.current = stream;

    const socket = new WebSocket(RELAY_WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("Connected — listening");
      setIsLive(true);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
          socket.send(event.data);
        }
      };

      mediaRecorder.start(250);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.is_final) {
        const segment: string = data.transcript;
        setFinalText((prev) => prev + segment + " ");
        setInterimText("");
        if (segment.trim()) checkMatch(segment);
      } else {
        setInterimText(data.transcript);
      }
    };

    socket.onerror = () => {
      setStatus("Connection error — check relay server logs");
    };

    socket.onclose = () => {
      setStatus("Disconnected");
      setIsLive(false);
    };
  }

  function stop() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    socketRef.current?.close();
    setStatus("Stopped");
    setIsLive(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-xl font-semibold">Talkshow — Live Detection Loop</h1>
      <p className={`mt-2 text-sm ${isLive ? "font-semibold text-green-600" : "text-zinc-500"}`}>
        {status}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        <a href="/upload" className="underline">
          Upload source material
        </a>{" "}
        before going live.
      </p>

      <div className="mt-5 flex gap-2">
        <button
          onClick={start}
          disabled={isLive}
          className="rounded-md bg-zinc-900 px-5 py-2.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Start
        </button>
        <button
          onClick={stop}
          disabled={!isLive}
          className="rounded-md border border-zinc-300 px-5 py-2.5 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          Stop
        </button>
      </div>

      <div className="mt-6 min-h-[120px] rounded-lg bg-zinc-100 p-4 text-base leading-relaxed dark:bg-zinc-900">
        <span>{finalText}</span>
        <span className="italic text-zinc-400">{interimText}</span>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {matching ? "Checking…" : "Matched"}
        </div>
        {match?.content ? (
          <div className="mt-2">
            <div className="text-xs text-zinc-500">
              {match.tier === "keyword"
                ? `keyword tier — tags: ${match.matchedTags?.join(", ")}`
                : `semantic tier — similarity ${match.similarity?.toFixed(3)}`}
            </div>
            <p className="mt-1 text-sm">{match.content}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">Nothing matched yet.</p>
        )}
      </div>
    </div>
  );
}
