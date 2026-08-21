"use client";

import { useEffect, useState } from "react";

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
};

export default function DisplayPage() {
  const [display, setDisplay] = useState<DisplayContent | null>(null);

  useEffect(() => {
   const socket = new WebSocket(
  `${getRelayWebSocketUrl()}?type=display`
);

    socket.onopen = () => {
      console.log("[display] connected");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "display") {
          setDisplay(data);
        }
      } catch (error) {
        console.error("[display] invalid message", error);
      }
    };

    socket.onerror = () => {
      console.error("[display] connection error");
    };

    socket.onclose = () => {
      console.log("[display] disconnected");
    };

    return () => {
      socket.close();
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-12 text-white">
      <div className="w-full max-w-6xl text-center">
        {display ? (
          <>
            {display.title && (
              <p className="mb-8 text-2xl font-medium uppercase tracking-[0.3em] text-zinc-400">
                {display.title}
              </p>
            )}

            <p className="text-5xl font-semibold leading-tight md:text-7xl">
              {display.content}
            </p>

            {display.source && (
              <p className="mt-10 text-xl text-zinc-500">
                {display.source}
              </p>
            )}
          </>
        ) : (
          <div>
            <div className="mx-auto mb-8 h-4 w-4 animate-pulse rounded-full bg-green-500" />

            <h1 className="text-5xl font-semibold md:text-7xl">
              Listening...
            </h1>

            <p className="mt-6 text-xl text-zinc-500">
              Relevant content will appear here
            </p>
          </div>
        )}
      </div>
    </main>
  );
}