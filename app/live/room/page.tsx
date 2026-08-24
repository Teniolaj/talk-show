"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LiveControl } from "../page";

// The control room keeps the existing live transcription and projector loop.
// Keeping it on its own route means the sidebar can remain a useful home for
// preparing a session, rather than opening the microphone immediately.
export default function LiveRoomPage() {
  return (
    <Suspense fallback={null}>
      <LiveRoom />
    </Suspense>
  );
}

function LiveRoom() {
  const talkShowId = useSearchParams().get("talkShowId");

  return talkShowId ? <LiveControl talkShowId={talkShowId} /> : null;
}
