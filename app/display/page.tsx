"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function getRelayWebSocketUrl() {
  if (process.env.NEXT_PUBLIC_RELAY_WS_URL) return process.env.NEXT_PUBLIC_RELAY_WS_URL;

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.hostname}:3001`;
}

type DisplayContent = {
  title?: string;
  content: string;
  source?: string;
  kind?: "command" | "auto";
};

type ContentItem =
  | { type: "paragraph"; content: string }
  | { type: "quote"; content: string }
  | { type: "bullets"; items: string[] }
  | { type: "numbers"; items: Array<{ number: string; content: string }> };

const BULLET_LINE = /^(?:[-*•‣▪] )(.+)$/;
const NUMBERED_LINE = /^(\d+)[.)] (.+)$/;

function parseContent(content: string): ContentItem[] {
  const lines = content.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const items: ContentItem[] = [];
  let cursor = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    const bullet = line.match(BULLET_LINE);
    const numbered = line.match(NUMBERED_LINE);

    if (bullet) {
      const bulletItems: string[] = [];
      while (cursor < lines.length) {
        const match = lines[cursor].match(BULLET_LINE);
        if (!match) break;
        bulletItems.push(match[1]);
        cursor += 1;
      }
      items.push({ type: "bullets", items: bulletItems });
      continue;
    }

    if (numbered) {
      const numberItems: Array<{ number: string; content: string }> = [];
      while (cursor < lines.length) {
        const match = lines[cursor].match(NUMBERED_LINE);
        if (!match) break;
        numberItems.push({ number: match[1], content: match[2] });
        cursor += 1;
      }
      items.push({ type: "numbers", items: numberItems });
      continue;
    }

    items.push({
      type: line.startsWith('"') || line.startsWith("“") || line.startsWith("'") ? "quote" : "paragraph",
      content: line,
    });
    cursor += 1;
  }

  return items;
}

function ProjectorContent({ content }: { content: string }) {
  const items = parseContent(content);
  const isSimple = items.length === 1 && (items[0].type === "paragraph" || items[0].type === "quote");

  return (
    <div className={isSimple ? "text-center" : "space-y-10 text-left sm:space-y-12 lg:space-y-14"}>
      {items.map((item, index) => {
        if (item.type === "bullets") {
          return (
            <ul key={index} className="space-y-8 sm:space-y-10 lg:space-y-12" aria-label="Key points">
              {item.items.map((point, pointIndex) => (
                <li key={`${point}-${pointIndex}`} className="grid grid-cols-[auto_1fr] items-start gap-5 sm:gap-6">
                  <span aria-hidden="true" className="mt-[0.58em] h-3 w-3 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 shadow-[0_0_18px_rgba(167,139,250,0.55)]" />
                  <p className="text-xl font-normal leading-[1.55] tracking-[-0.02em] text-white sm:text-2xl lg:text-4xl">{point}</p>
                </li>
              ))}
            </ul>
          );
        }

        if (item.type === "numbers") {
          return (
            <ol key={index} className="space-y-8 sm:space-y-10 lg:space-y-12" aria-label="Steps">
              {item.items.map((step, stepIndex) => (
                <li key={`${step.number}-${stepIndex}`} className="grid grid-cols-[auto_1fr] items-start gap-5 sm:gap-6">
                  <span className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 px-2 text-sm font-bold tabular-nums text-white shadow-lg shadow-violet-300/50 sm:h-12 sm:min-w-12 sm:text-base">{step.number}</span>
                  <p className="pt-0.5 text-xl font-normal leading-[1.55] tracking-[-0.02em] text-white sm:text-2xl lg:text-4xl">{step.content}</p>
                </li>
              ))}
            </ol>
          );
        }

        if (item.type === "quote") {
          return (
            <blockquote key={index} className="relative mx-auto max-w-5xl py-2">
              <span aria-hidden="true" className="absolute -left-2 -top-11 select-none font-serif text-8xl leading-none text-violet-300 sm:-left-7 sm:text-9xl">“</span>
              <p className="relative text-3xl font-normal leading-[1.42] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">{item.content}</p>
            </blockquote>
          );
        }

        return <p key={index} className="mx-auto max-w-[82rem] text-3xl font-normal leading-[1.45] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl">{item.content}</p>;
      })}
    </div>
  );
}

export default function DisplayPage() {
  return <Suspense fallback={null}><DisplayScreen /></Suspense>;
}

function DisplayScreen() {
  const talkShowId = useSearchParams().get("talkShowId");
  const [display, setDisplay] = useState<DisplayContent | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!talkShowId) return;
    const socket = new WebSocket(`${getRelayWebSocketUrl()}?type=display&talkShowId=${encodeURIComponent(talkShowId)}`);

    socket.onopen = () => setIsConnected(true);
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DisplayContent & { type?: string };
        if (data.type === "display") setDisplay(data);
        if (data.type === "clear") setDisplay(null);
      } catch {
        // Keep the last valid presentation slide visible.
      }
    };
    socket.onerror = () => setIsConnected(false);
    socket.onclose = () => setIsConnected(false);
    return () => socket.close();
  }, [talkShowId]);

  if (!talkShowId) {
    return (
      <main className="grid min-h-screen place-items-center overflow-hidden bg-[#13121f] px-6 text-center text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(124,58,237,0.34),transparent_28rem),radial-gradient(circle_at_85%_80%,rgba(217,70,239,0.2),transparent_32rem)]" />
        <div className="relative max-w-lg">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-xl font-bold shadow-2xl shadow-violet-950/70">T</div>
          <h1 className="mt-7 text-3xl font-semibold tracking-[-0.04em]">No talk show selected</h1>
          <p className="mt-3 text-base leading-7 text-zinc-300">Open this screen from a live session&apos;s projector-view link.</p>
        </div>
      </main>
    );
  }

  const isPresenterPick = display?.kind === "command";
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#11111a] px-6 py-6 text-white sm:px-10 sm:py-8 lg:px-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(99,102,241,0.27),transparent_31rem),radial-gradient(circle_at_98%_100%,rgba(192,38,211,0.18),transparent_35rem)]" />

      <div className="relative flex min-h-[calc(100vh-3rem)] w-full flex-col">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-sm font-bold shadow-lg shadow-violet-950/50">T</div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-white sm:text-base">Talkshow</p>
              <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-zinc-500 sm:text-[10px]">Audience display</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 shadow-sm backdrop-blur-sm">
            <span className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" : "bg-amber-300"}`} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300 sm:text-xs">{isConnected ? "Live" : "Connecting"}</span>
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center py-10 sm:py-14 lg:py-16">
          {display ? (
            <div className="w-full max-w-[90rem]">
              <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 shadow-sm backdrop-blur-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${isPresenterPick ? "bg-fuchsia-300" : "bg-emerald-400"}`} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100/80 sm:text-xs">{isPresenterPick ? "Presenter selected" : "Live context"}</span>
              </div>
              <p className="mt-7 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-violet-200/55 sm:text-xs">{display.title || "Conversation highlight"}</p>
              <div className="mt-5 px-2 py-5 sm:px-8 sm:py-8 lg:px-12">
                <ProjectorContent content={display.content} />
              </div>
              {display.source && <p className="mt-6 text-center text-xs font-medium text-zinc-400 sm:text-sm"><span className="mr-2 uppercase tracking-[0.17em] text-violet-200/55">Source</span>{display.source}</p>}
            </div>
          ) : (
            <div className="max-w-3xl text-center">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-white/[0.07] text-3xl shadow-xl shadow-black/30">✦</div>
              <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.3em] text-violet-200/60 sm:text-xs">Live audience screen</p>
              <h1 className="mt-5 text-5xl font-semibold tracking-[-0.055em] text-white sm:text-6xl lg:text-8xl">Ready when<span className="block bg-gradient-to-r from-violet-200 via-fuchsia-200 to-violet-300 bg-clip-text text-transparent">you are.</span></h1>
              <p className="mx-auto mt-7 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">Relevant moments from the conversation will appear here for everyone to see.</p>
            </div>
          )}
        </section>

        <footer className="flex items-center justify-between border-t border-white/10 pt-5 text-[9px] font-semibold uppercase tracking-[0.2em] text-violet-200/50 sm:text-[10px]"><span>Talkshow · Live presentation assistant</span><span>{display ? "Now showing" : "Waiting for a match"}</span></footer>
      </div>
    </main>
  );
}
