"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function getRelayWebSocketUrl() {
  if (process.env.NEXT_PUBLIC_RELAY_WS_URL) {
    return process.env.NEXT_PUBLIC_RELAY_WS_URL;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:3001`;
}

type DisplayContent = {
  title?: string;
  content: string;
  source?: string;
  kind?: "command" | "auto";
};

export default function DisplayPage() {
  return (
    <Suspense fallback={null}>
      <DisplayScreen />
    </Suspense>
  );
}

function DisplayScreen() {
  const talkShowId = useSearchParams().get("talkShowId");
  const [display, setDisplay] = useState<DisplayContent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!talkShowId) return;

    const socket = new WebSocket(
      `${getRelayWebSocketUrl()}?type=display&talkShowId=${encodeURIComponent(talkShowId)}`
    );

    socket.onopen = () => setIsConnected(true);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DisplayContent & { type?: string };
        if (data.type === "display") setDisplay(data);
        if (data.type === "clear") setDisplay(null);
      } catch {
        // Ignore malformed messages and keep the current projector content visible.
      }
    };

    socket.onerror = () => setIsConnected(false);
    socket.onclose = () => setIsConnected(false);

    return () => socket.close();
  }, [talkShowId]);

  if (!talkShowId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090b12] px-6 text-center text-white">
        <div>
          <h1 className="text-2xl font-semibold">No talk show specified</h1>
          <p className="mt-3 text-zinc-400">
            Open this screen from a live session&apos;s &quot;Open Projector View&quot; link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#090b12] px-6 py-7 text-white sm:px-10 lg:px-16">
      <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-violet-600/20 blur-[130px]" />
      <div className="absolute -right-32 bottom-0 h-[32rem] w-[32rem] rounded-full bg-cyan-400/10 blur-[150px]" />

      <div className="relative flex w-full flex-col">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-base font-bold text-[#0b0d15] shadow-lg shadow-white/10">
              T
            </div>
            <div>
              <p className="text-base font-semibold tracking-tight text-white">Talkshow</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500">
                Audience display
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? "animate-pulse bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span className="text-xs font-medium text-zinc-300">
              {isConnected ? "LIVE" : "CONNECTING"}
            </span>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center py-12 sm:py-16">
          <div className="w-full max-w-6xl text-center">
            {display ? (
              <>
                <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                  {display.kind === "command" ? "Presenter selected" : "Detected information"}
                </div>

                <p className="mx-auto max-w-4xl text-lg font-medium uppercase tracking-[0.22em] text-zinc-400 sm:text-xl">
                  {display.title || "Live context"}
                </p>

                <div className="mt-7 rounded-[2rem] border border-white/10 bg-white/[0.055] px-7 py-10 shadow-2xl shadow-black/20 backdrop-blur-sm sm:px-12 sm:py-14">
                  <p className="text-4xl font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-7xl">
                    {display.content}
                  </p>
                </div>

                {display.source && (
                  <p className="mt-7 text-sm font-medium uppercase tracking-[0.18em] text-zinc-500 sm:text-base">
                    From {display.source}
                  </p>
                )}
              </>
            ) : (
              <div>
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.055] text-3xl shadow-xl shadow-black/20">
                  ✦
                </div>

                <p className="mt-9 text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
                  Live audience screen
                </p>

                <h1 className="mt-4 text-5xl font-semibold tracking-tight text-white sm:text-6xl lg:text-8xl">
                  Listening for
                  <span className="block text-zinc-500">what matters.</span>
                </h1>

                <p className="mx-auto mt-7 max-w-xl text-lg leading-8 text-zinc-400 sm:text-xl">
                  Relevant information from the live conversation will appear here for everyone to see.
                </p>
              </div>
            )}
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-white/10 pt-5 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-600 sm:text-xs">
          <span>Live presentation assistant</span>
          <span>{display ? "Now showing" : "Waiting for a match"}</span>
        </footer>
      </div>
    </main>
  );
}
