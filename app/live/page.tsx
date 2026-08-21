"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { getTalkShow, type TalkShow } from "@/lib/talk-shows";

function getRelayWebSocketUrl() {
  if (process.env.NEXT_PUBLIC_RELAY_WS_URL) {
    return process.env.NEXT_PUBLIC_RELAY_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:3001`;
}

type MatchResult = {
  tier: "keyword" | "semantic" | null;
  content: string | null;
  similarity?: number;
  matchedTags?: string[];
};

type RelayMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "transcript"; transcript: string; is_final: boolean };

export default function LivePage() {
  return (
    <Suspense fallback={null}>
      <LiveSession />
    </Suspense>
  );
}

function LiveSession() {
  const searchParams = useSearchParams();
  const talkShowId = searchParams.get("talkShowId");

  const [talkShow, setTalkShow] = useState<TalkShow | null>(null);

  const [status, setStatus] = useState(
    "Ready — start the session when you're ready"
  );

  const [isLive, setIsLive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matching, setMatching] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const closedByUserRef = useRef(false);
  const connectedRef = useRef(false);
  const connectionErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!talkShowId) return;
    getTalkShow(talkShowId).then(setTalkShow);
  }, [talkShowId]);

  useEffect(() => {
  return () => {
    closedByUserRef.current = true;

    mediaRecorderRef.current?.stop();

    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    socketRef.current?.close();
  };
}, []);

  async function checkMatch(segment: string) {
    setMatching(true);

    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transcript: segment,
          talkShowId,
        }),
      });

      const result: MatchResult = await res.json();

      if (result.tier && result.content) {
        setMatch(result);

        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: "display",
              title: result.matchedTags?.[0] || "Detected information",
              content: result.content,
              source: talkShow?.name,
            })
          );
        }
      } else {
        setMatch(null);
      }
    } catch (err) {
      console.error("match request failed", err);
    } finally {
      setMatching(false);
    }
  }

  function clearDisplayedContent() {
    setMatch(null);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "clear-display" }));
    }
  }

  async function start() {
    if (isLive || isStarting) return;

    setIsStarting(true);
    setStatus("Requesting microphone access…");

    closedByUserRef.current = false;
    connectedRef.current = false;
    connectionErrorRef.current = null;

    // Clear previous session content
    setFinalText("");
    setInterimText("");
    setMatch(null);

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch {
      setStatus("Microphone access denied — check browser permissions");
      setIsStarting(false);
      return;
    }

    mediaStreamRef.current = stream;

  const socket = new WebSocket(
  `${getRelayWebSocketUrl()}?type=live`
);
    socketRef.current = socket;


    socket.onopen = () => {
      setStatus("Connecting to the transcription service…");

      const mediaRecorder = MediaRecorder.isTypeSupported(
        "audio/webm;codecs=opus"
      )
        ? new MediaRecorder(stream, {
            mimeType: "audio/webm;codecs=opus",
          })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (
          event.data.size > 0 &&
          socket.readyState === WebSocket.OPEN
        ) {
          socket.send(event.data);
        }
      };

      mediaRecorder.start(250);
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as RelayMessage;

      if (data.type === "ready") {
        connectedRef.current = true;
        setIsStarting(false);
        setIsLive(true);
        setStatus("Listening");
        return;
      }

      if (data.type === "error") {
        connectionErrorRef.current = data.message;
        setIsStarting(false);
        setIsLive(false);
        setStatus(data.message);
        socket.close();
        return;
      }

      if (data.is_final) {
        const segment: string = data.transcript;

        setFinalText((prev) => prev + segment + " ");
        setInterimText("");

        if (segment.trim()) {
          checkMatch(segment);
        }
      } else {
        setInterimText(data.transcript);
      }
    };

    socket.onerror = () => {
      setStatus("Unable to connect to the live transcription service");
    };

    socket.onclose = () => {
      const wasConnected = connectedRef.current;

      socketRef.current = null;
      mediaRecorderRef.current = null;

      mediaStreamRef.current
        ?.getTracks()
        .forEach((track) => track.stop());

      setIsStarting(false);
      setIsLive(false);

      if (closedByUserRef.current) {
        setStatus("Session stopped");
      } else if (wasConnected) {
        setStatus(
          "Live transcription connection closed"
        );
      } else if (connectionErrorRef.current) {
        setStatus(connectionErrorRef.current);
      } else {
        setStatus(
          "Live transcription service is unavailable"
        );
      }
    };
  }

  function stop() {
    closedByUserRef.current = true;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    clearDisplayedContent();
    socketRef.current?.close();

    setStatus("Session stopped");
    setIsLive(false);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <Link
              href="/talk-shows"
              className="text-sm text-zinc-500 transition hover:text-zinc-900"
            >
              ← Back to Talk Shows
            </Link>

            <div className="mt-3 flex items-center gap-3">
              <h1 className="text-xl font-semibold text-zinc-900">
                {talkShow?.name || "Live Talk Show"}
              </h1>

              {talkShow?.category && (
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize text-zinc-600">
                  {talkShow.category}
                </span>
              )}
            </div>
          </div>

          {/* Simple status */}
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isLive
                  ? "animate-pulse bg-green-500"
                  : "bg-zinc-300"
              }`}
            />

            <span
              className={`text-sm font-medium ${
                isLive
                  ? "text-green-600"
                  : "text-zinc-500"
              }`}
            >
              {isLive ? "LIVE" : "READY"}
            </span>

            <Link
              href="/display"
              target="_blank"
              className="ml-4 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900"
            >
              Open Projector View
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Simple Live Control */}
        <section className="rounded-3xl bg-zinc-900 px-6 py-7 text-white">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                {isLive && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                )}

                <p className="text-sm font-medium text-zinc-300">
                  {isLive ? "Listening" : "Live Session"}
                </p>
              </div>

              <h2 className="mt-2 text-2xl font-semibold">
                {isLive
                  ? "The conversation is being monitored"
                  : "Ready to start"}
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                {status}
              </p>
            </div>

            {!isLive ? (
              <button
                onClick={start}
                disabled={isStarting}
                className="rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStarting ? "Starting…" : "Start Session"}
              </button>
            ) : (
              <button
                onClick={stop}
                className="rounded-xl border border-zinc-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                End Session
              </button>
            )}
          </div>
        </section>

        {/* Main Workspace */}
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* Transcript */}
          <section className="lg:col-span-3">
            <div className="rounded-3xl border border-zinc-200 bg-white">
              <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
                <div>
                  <h2 className="font-semibold text-zinc-900">
                    Conversation
                  </h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Live transcript
                  </p>
                </div>

                {isLive && (
                  <span className="text-xs font-medium text-green-600">
                    Listening
                  </span>
                )}
              </div>

              <div className="min-h-[420px] p-6">
                {finalText || interimText ? (
                  <div className="text-base leading-8 text-zinc-800">
                    <span>{finalText}</span>

                    <span className="italic text-zinc-400">
                      {interimText}
                    </span>
                  </div>
                ) : (
                  <div className="flex min-h-[360px] items-center justify-center text-center">
                    <div>
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-xl">
                        🎙
                      </div>

                      <h3 className="mt-4 font-medium text-zinc-900">
                        {isLive
                          ? "Listening..."
                          : "Start the session"}
                      </h3>

                      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                        {isLive
                          ? "Start speaking and your conversation will appear here."
                          : "Start the live session to begin listening to the conversation."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Detection */}
          <section className="lg:col-span-2">
            <div className="rounded-3xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-6 py-5">
                <h2 className="font-semibold text-zinc-900">
                  Detected
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  Relevant information from the conversation
                </p>
              </div>

              <div className="min-h-[420px] p-6">
                {matching ? (
                  <div className="flex min-h-[360px] items-center justify-center">
                    <div className="text-center">
                      <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />

                      <p className="mt-4 text-sm text-zinc-500">
                        Checking...
                      </p>
                    </div>
                  </div>
                ) : match?.content ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-green-500" />

                      <span className="text-sm font-semibold text-green-700">
                        Relevant information detected
                      </span>
                      </div>

                      <button
                        type="button"
                        onClick={clearDisplayedContent}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        Clear display
                      </button>
                    </div>

                    <div className="mt-5 rounded-2xl bg-zinc-50 p-5">
                      <p className="text-base leading-7 text-zinc-800">
                        {match.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[360px] items-center justify-center text-center">
                    <div>
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-xl">
                        🔎
                      </div>

                      <h3 className="mt-4 font-medium text-zinc-900">
                        Nothing detected yet
                      </h3>

                      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                        Relevant information will appear here
                        automatically when detected.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
