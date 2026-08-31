"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import Sidebar from "@/app/Components/sidebar";
import {
  getTalkShow,
  getTalkShows,
  incrementTalkShowSessionCount,
  type TalkShow,
} from "@/lib/talk-shows";
import {
  defaultLivePreferences,
  readLivePreferences,
  type LivePreferences,
} from "@/lib/live-preferences";
import { recordActivity } from "@/lib/recent-activity";
import type { MatchResult } from "@/lib/match-types";

function getRelayWebSocketUrl() {
  if (process.env.NEXT_PUBLIC_RELAY_WS_URL) {
    return process.env.NEXT_PUBLIC_RELAY_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:3001`;
}

type RelayMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "transcript"; transcript: string; is_final: boolean }
  | { type: "utterance_end" };

// Same-window heuristic for picking the best match among several final
// segments Deepgram split out of one spoken thought — not a global ranking.
// Keyword tier is trusted if it hits at all, so it always outranks semantic.
function scoreForMatch(result: MatchResult): number {
  if (result.tier === "keyword") return 10 + (result.matchedTags?.length ?? 0);
  if (result.tier === "semantic") return result.similarity ?? 0;
  return 0;
}

// Cheap client-side pre-check so an explicit "slide on ___" command still
// reaches /api/match even when automatic detection is toggled off. Mirrors
// the server's SLIDE_COMMAND_TRIGGER (app/api/match/route.ts) closely enough
// to gate capture — the server does the authoritative extraction.
const SLIDE_COMMAND_HINT = /\bslides?\s+on\b/i;

// Once the trigger is heard, how long to wait after the presenter stops
// producing new final segments before treating the command phrase as
// complete (Deepgram often splits one spoken heading across several final
// segments). Short enough to feel responsive, long enough to catch a
// mid-heading pause.
const COMMAND_CAPTURE_SILENCE_MS = 800;

// Hard cap on how long capture stays open if the presenter never pauses
// after the trigger (e.g. runs straight on into other remarks) — without
// this, capture could keep absorbing speech indefinitely and never resolve.
const COMMAND_CAPTURE_MAX_MS = 6000;

type LibraryDocument = {
  id: string;
  status: string;
};

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

  return talkShowId ? (
    <LiveSessionCheck key={talkShowId} talkShowId={talkShowId} />
  ) : (
    <LiveSessionPicker />
  );
}

function LiveSessionPicker() {
  const [talkShows, setTalkShows] = useState<TalkShow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTalkShows()
      .then(setTalkShows)
      .catch((error) => console.error("Failed to load talk shows", error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-64 min-h-screen">
        <header className="border-b border-zinc-200 bg-white px-10 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Live Sessions
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Choose the talk show you&apos;re about to run. Talkshow will only use the sources selected for it.
          </p>
        </header>

        <div className="px-10 py-10">
          <section className="rounded-3xl bg-zinc-900 p-8 text-white">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Before you go live</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">Pick the right context for this conversation.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Your live transcript is checked against that talk show&apos;s selected content, then relevant information can be sent to the audience display.
            </p>
          </section>

          <section className="mt-8">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Start a new session</h2>
                <p className="mt-1 text-sm text-zinc-500">You can update its sources from the talk show page before starting.</p>
              </div>
              <Link href="/talk-shows" className="shrink-0 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:underline">
                Manage talk shows
              </Link>
            </div>

            {loading ? (
              <div className="flex min-h-56 items-center justify-center rounded-3xl border border-zinc-200 bg-white text-sm text-zinc-500">Loading talk shows...</div>
            ) : talkShows.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">🎙</div>
                <h3 className="mt-4 text-lg font-semibold text-zinc-900">No talk shows available</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">Live Sessions only lets you select and prepare an existing talk show.</p>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {talkShows.map((talkShow) => {
                  const sourceCount = talkShow.documentIds?.length ?? 0;
                  return (
                    <Link key={talkShow.id} href={`/live?talkShowId=${talkShow.id}`} className="group rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-400 hover:shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-xl">🎙</span>
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize text-zinc-600">{talkShow.category}</span>
                      </div>
                      <h3 className="mt-5 text-lg font-semibold text-zinc-900">{talkShow.name}</h3>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">{talkShow.description}</p>
                      <div className="mt-6 flex items-center justify-between border-t border-zinc-100 pt-4">
                        <span className={`text-xs font-medium ${sourceCount > 0 ? "text-green-700" : "text-amber-700"}`}>{sourceCount} selected source{sourceCount === 1 ? "" : "s"}</span>
                        <span className="text-sm font-medium text-zinc-900 group-hover:underline">Start session →</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function LiveSessionCheck({ talkShowId }: { talkShowId: string }) {
  const [talkShow, setTalkShow] = useState<TalkShow | null>(null);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTalkShow(talkShowId),
      fetch("/api/documents")
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load documents");
          return response.json() as Promise<{ documents?: LibraryDocument[] }>;
        })
        .then(({ documents }) => documents ?? []),
    ])
      .then(([show, libraryDocuments]) => {
        setTalkShow(show);
        setDocuments(libraryDocuments);
      })
      .catch((error) => console.error("Failed to prepare live session", error))
      .finally(() => setLoading(false));
  }, [talkShowId]);

  const selectedSourceIds = talkShow?.documentIds ?? [];
  const readySourceCount = documents.filter(
    (document) => selectedSourceIds.includes(document.id) && document.status === "ready"
  ).length;
  const canGoLive = readySourceCount > 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-64 min-h-screen">
        <header className="border-b border-zinc-200 bg-white px-10 py-5">
          <Link href="/live" className="text-sm text-zinc-500 transition hover:text-zinc-900">
            ← Back to Live Sessions
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
            Prepare your session
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Check the context Talkshow will use before you turn on the microphone.
          </p>
        </header>

        <div className="mx-auto max-w-5xl px-10 py-10">
          {loading ? (
            <div className="flex min-h-72 items-center justify-center rounded-3xl border border-zinc-200 bg-white text-sm text-zinc-500">Checking your talk show...</div>
          ) : !talkShow ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 text-center">
              <h2 className="text-lg font-semibold text-zinc-900">Talk show not found</h2>
              <Link href="/live" className="mt-4 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:underline">Choose another talk show</Link>
            </div>
          ) : (
            <>
              <section className="rounded-3xl bg-zinc-900 p-8 text-white">
                <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Selected talk show</p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">{talkShow.name}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{talkShow.description}</p>
                  </div>
                  <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-medium capitalize text-zinc-300">{talkShow.category}</span>
                </div>
              </section>

              <section className="mt-7 rounded-3xl border border-zinc-200 bg-white p-7">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">Session check</p>
                    <h2 className="mt-2 text-xl font-semibold text-zinc-900">Ready to go live?</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">Talkshow will cross-check the live conversation against the ready sources below.</p>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${canGoLive ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {canGoLive ? "Ready to go live" : "Needs attention"}
                  </span>
                </div>

                <div className="mt-7 space-y-3">
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-zinc-50 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Talk show selected</p>
                      <p className="mt-1 text-xs text-zinc-500">{talkShow.name} is the context for this session.</p>
                    </div>
                    <span className="text-sm font-medium text-green-700">✓</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-zinc-50 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Content sources ready</p>
                      <p className="mt-1 text-xs text-zinc-500">{readySourceCount} of {selectedSourceIds.length} selected source{selectedSourceIds.length === 1 ? "" : "s"} ready for matching.</p>
                    </div>
                    <span className={`text-sm font-medium ${canGoLive ? "text-green-700" : "text-amber-700"}`}>{canGoLive ? "✓" : "!"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-zinc-50 px-5 py-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">Audience display</p>
                      <p className="mt-1 text-xs text-zinc-500">You can open it from the control room once the session begins.</p>
                    </div>
                    <span className="text-xs font-medium text-zinc-500">Optional</span>
                  </div>
                </div>

                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-6">
                  <Link href={`/talk-shows/${talkShow.id}`} className="text-sm font-medium text-zinc-600 transition hover:text-zinc-900 hover:underline">Review content sources</Link>
                  {canGoLive ? (
                    <Link href={`/live/room?talkShowId=${talkShow.id}`} className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800">Go live →</Link>
                  ) : (
                    <Link href={`/talk-shows/${talkShow.id}`} className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800">Add ready sources →</Link>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export function LiveControl({ talkShowId }: { talkShowId: string }) {
  const [talkShow, setTalkShow] = useState<TalkShow | null>(null);
  const [sourceStatus, setSourceStatus] = useState<"loading" | "ready" | "not-ready">("loading");
  const [preferences, setPreferences] = useState<LivePreferences>(defaultLivePreferences);

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
  const bestInWindowRef = useRef<MatchResult | null>(null);
  const windowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentTranscriptRef = useRef("");
  // Set on utterance_end, consumed by the next transcript event — clears the
  // displayed transcript right when the next utterance actually starts,
  // rather than the moment the previous one ends (so old text stays on
  // screen through the pause instead of flashing blank).
  const pendingClearRef = useRef(false);

  // Dedicated buffer for the explicit "slide on ___" command, separate from
  // recentTranscriptRef (automatic-detection context). While capturing,
  // subsequent final segments are diverted here instead of being appended to
  // the auto-detection buffer or re-triggering a fresh command check — this
  // is what stops "show me the slide on X" plus everything said right after
  // it from bleeding into (and corrupting) the command match. Capture closes
  // itself back down once resolved, so nothing is captured again until the
  // trigger phrase is heard once more.
  const commandCaptureRef = useRef(false);
  const commandBufferRef = useRef("");
  const commandCaptureStartRef = useRef<number | null>(null);
  const commandResolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!talkShowId) return;
    getTalkShow(talkShowId).then(setTalkShow);
  }, [talkShowId]);

  useEffect(() => {
    queueMicrotask(() => setPreferences(readLivePreferences()));
  }, []);

  useEffect(() => {
    if (!talkShow) return;

    const selectedSourceIds = talkShow.documentIds ?? [];
    if (selectedSourceIds.length === 0) {
      queueMicrotask(() => setSourceStatus("not-ready"));
      return;
    }

    fetch("/api/documents")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load source status");
        return response.json() as Promise<{ documents?: LibraryDocument[] }>;
      })
      .then(({ documents }) => {
        const readySourceIds = new Set(
          (documents ?? [])
            .filter((document) => document.status === "ready")
            .map((document) => document.id)
        );
        setSourceStatus(selectedSourceIds.some((id) => readySourceIds.has(id)) ? "ready" : "not-ready");
      })
      .catch(() => setSourceStatus("not-ready"));
  }, [talkShow]);

  useEffect(() => {
  return () => {
    closedByUserRef.current = true;

    mediaRecorderRef.current?.stop();

    mediaStreamRef.current
      ?.getTracks()
      .forEach((track) => track.stop());

    socketRef.current?.close();

    if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
    if (commandResolveTimerRef.current) clearTimeout(commandResolveTimerRef.current);
  };
}, []);

  function displayMatch(result: MatchResult) {
    setMatch(result);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const title =
        result.kind === "command"
          ? `You selected: ${result.matchedHeading ?? result.commandPhrase}`
          : result.matchedTags?.[0] || "Detected information";

      socketRef.current.send(
        JSON.stringify({
          type: "display",
          title,
          content: result.content,
          source: talkShow?.name,
          kind: result.kind,
        })
      );
    }
  }

  function flushBestInWindow() {
    if (windowTimerRef.current) {
      clearTimeout(windowTimerRef.current);
      windowTimerRef.current = null;
    }

    if (bestInWindowRef.current) {
      displayMatch(bestInWindowRef.current);
      bestInWindowRef.current = null;
    }
  }

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

      if (result.kind === "command") {
        // An explicit command is a single decisive action — bypass the
        // grouping window entirely and override whatever was showing.
        if (windowTimerRef.current) {
          clearTimeout(windowTimerRef.current);
          windowTimerRef.current = null;
        }
        bestInWindowRef.current = null;

        if (result.tier && result.content) {
          displayMatch(result);
        } else if (result.message) {
          setStatus(result.message);
        }
        return;
      }

      if (!preferences.automaticDetection) return;

      if (result.tier && result.content) {
        const score = scoreForMatch(result);
        if (!bestInWindowRef.current || score > scoreForMatch(bestInWindowRef.current)) {
          bestInWindowRef.current = result;
        }

        if (windowTimerRef.current) clearTimeout(windowTimerRef.current);
        windowTimerRef.current = setTimeout(flushBestInWindow, 1200);
      }
    } catch (err) {
      console.error("match request failed", err);
    } finally {
      setMatching(false);
    }
  }

  // Closes command capture and sends whatever was heard since the trigger.
  // Called either after a silence pause or once COMMAND_CAPTURE_MAX_MS is
  // hit — either way, capture is off again afterward until "slide on" (or
  // "slides on") is heard fresh.
  function resolveCommandCapture() {
    if (commandResolveTimerRef.current) {
      clearTimeout(commandResolveTimerRef.current);
      commandResolveTimerRef.current = null;
    }

    const phrase = commandBufferRef.current.trim();
    commandBufferRef.current = "";
    commandCaptureRef.current = false;
    commandCaptureStartRef.current = null;

    if (phrase) checkMatch(phrase);
  }

  function clearDisplayedContent() {
    if (windowTimerRef.current) {
      clearTimeout(windowTimerRef.current);
      windowTimerRef.current = null;
    }
    bestInWindowRef.current = null;
    setMatch(null);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "clear-display" }));
    }
  }

  async function start() {
    if (isLive || isStarting) return;

    if (!talkShow) {
      setStatus("Loading this talk show — try again in a moment");
      return;
    }

    if (sourceStatus === "loading") {
      setStatus("Checking the selected content sources…");
      return;
    }

    if (sourceStatus === "not-ready") {
      setStatus("Add a ready content source to this talk show before going live");
      return;
    }

    setIsStarting(true);
    setStatus("Requesting a session token…");

    closedByUserRef.current = false;
    connectedRef.current = false;
    connectionErrorRef.current = null;

    let relayToken: string;

    try {
      const tokenRes = await fetch("/api/relay/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talkShowId }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.token) {
        setStatus(tokenData.error ?? "Could not start a live session — try again");
        setIsStarting(false);
        return;
      }
      relayToken = tokenData.token;
    } catch {
      setStatus("Could not reach the server to start this session");
      setIsStarting(false);
      return;
    }

    setStatus("Requesting microphone access…");

    // Clear previous session content
    setFinalText("");
    setInterimText("");
    setMatch(null);
    recentTranscriptRef.current = "";
    pendingClearRef.current = false;
    if (commandResolveTimerRef.current) {
      clearTimeout(commandResolveTimerRef.current);
      commandResolveTimerRef.current = null;
    }
    commandCaptureRef.current = false;
    commandBufferRef.current = "";
    commandCaptureStartRef.current = null;

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
    } catch {
      setStatus("Microphone access denied — check browser permissions");
      setIsStarting(false);
      return;
    }

    mediaStreamRef.current = stream;

    const socket = new WebSocket(
      `${getRelayWebSocketUrl()}?type=live&talkShowId=${encodeURIComponent(talkShowId)}&token=${encodeURIComponent(relayToken)}`
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

      if (data.type === "utterance_end") {
        flushBestInWindow();
        // A natural pause is the clearest signal a command phrase is
        // complete — resolve it immediately rather than waiting out the
        // silence timer.
        if (commandCaptureRef.current) resolveCommandCapture();
        pendingClearRef.current = true;
        return;
      }

      if (data.is_final) {
        const segment: string = data.transcript;
        const isNewUtterance = pendingClearRef.current;

        setFinalText((prev) => (isNewUtterance ? "" : prev) + segment + " ");
        setInterimText("");
        pendingClearRef.current = false;

        if (!segment.trim()) return;

        // Trigger-gated command capture: once "slide on"/"slides on" is
        // heard, everything the presenter says next is diverted here (not
        // into the auto-detection buffer, and not re-checked as a fresh
        // command) until capture resolves — at which point it goes quiet
        // again until the trigger is said once more.
        if (commandCaptureRef.current || SLIDE_COMMAND_HINT.test(segment)) {
          if (!commandCaptureRef.current) {
            commandCaptureRef.current = true;
            commandCaptureStartRef.current = Date.now();
            commandBufferRef.current = "";
          }

          commandBufferRef.current = `${commandBufferRef.current} ${segment}`.trim();

          if (commandResolveTimerRef.current) clearTimeout(commandResolveTimerRef.current);

          const elapsed = Date.now() - (commandCaptureStartRef.current ?? Date.now());
          if (elapsed >= COMMAND_CAPTURE_MAX_MS) {
            resolveCommandCapture();
          } else {
            commandResolveTimerRef.current = setTimeout(resolveCommandCapture, COMMAND_CAPTURE_SILENCE_MS);
          }
          return;
        }

        // Reset alongside the transcript box on a new utterance — otherwise
        // stale context from the previous utterance stays in this rolling
        // buffer and gets folded into the next match.
        const priorContext = isNewUtterance ? "" : recentTranscriptRef.current;
        const matchableTranscript = `${priorContext} ${segment}`.trim().slice(-500);
        recentTranscriptRef.current = matchableTranscript;

        if (preferences.automaticDetection) {
          checkMatch(matchableTranscript);
        }
      } else {
        if (pendingClearRef.current) {
          setFinalText("");
          pendingClearRef.current = false;
        }
        setInterimText(data.transcript);
      }
    };

    socket.onerror = () => {
      setStatus("Unable to connect to the live transcription service");
    };

    socket.onclose = (event) => {
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
      } else if (event.code === 4001) {
        setStatus("This session token expired or was invalid — try starting again");
      } else if (event.code === 4002) {
        setStatus("Too many live sessions are running right now — try again shortly");
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

    if (commandResolveTimerRef.current) {
      clearTimeout(commandResolveTimerRef.current);
      commandResolveTimerRef.current = null;
    }
    commandCaptureRef.current = false;
    commandBufferRef.current = "";
    commandCaptureStartRef.current = null;

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

    if (isLive && talkShowId) {
      incrementTalkShowSessionCount(talkShowId)
        .then(setTalkShow)
        .catch((error) => console.error("Failed to record session count", error));
    }

    setIsLive(false);

    if (talkShow) {
      recordActivity({
        type: "session-completed",
        title: `${talkShow.name} live session completed`,
      }).catch((error) => console.error("Failed to record session activity", error));
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <Link
              href="/live"
              className="text-sm text-zinc-500 transition hover:text-zinc-900"
            >
              ← Back to Live Sessions
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
              href={`/display?talkShowId=${encodeURIComponent(talkShowId)}`}
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
                {!preferences.showLiveTranscript ? (
                  <div className="flex min-h-[360px] items-center justify-center text-center">
                    <div>
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-xl">🎙</div>
                      <h3 className="mt-4 font-medium text-zinc-900">Transcript hidden</h3>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">You can turn it back on from Settings at any time.</p>
                    </div>
                  </div>
                ) : finalText || interimText ? (
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
                        {match.kind === "command"
                          ? "You selected this slide"
                          : "Relevant information detected"}
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
