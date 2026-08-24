"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import Sidebar from "../Components/sidebar";
import { deleteTalkShow, getTalkShows, type TalkShow } from "@/lib/talk-shows";
import { getShowCover } from "@/lib/show-cover";

export default function TalkShows() {
  const [talkShows, setTalkShows] = useState<TalkShow[]>([]);
  const [deletingTalkShowId, setDeletingTalkShowId] = useState<string | null>(null);

  useEffect(() => {
    getTalkShows().then(setTalkShows);
  }, []);

  async function handleDeleteTalkShow(talkShow: TalkShow) {
    setDeletingTalkShowId(talkShow.id);
    try {
      await deleteTalkShow(talkShow.id);
      setTalkShows((current) => current.filter((show) => show.id !== talkShow.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not delete talk show.");
    } finally {
      setDeletingTalkShowId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-64 min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-10 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Talk Shows
            </h1>

            <p className="mt-1 text-sm text-zinc-500">
              Create and manage your talk shows.
            </p>
          </div>

          <Link
            href="/talk-shows/create"
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            + Create Talk Show
          </Link>
        </header>

        {/* Content */}
        <div className="px-10 py-10">
          {talkShows.length === 0 ? (
            /* Empty State */
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-100 text-3xl">
                🎙
              </div>

              <h2 className="mt-6 text-xl font-semibold text-zinc-900">
                No talk shows yet
              </h2>

              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Create your first talk show to organize your content and
                prepare for live sessions.
              </p>

              <Link
                href="/talk-shows/create"
                className="mt-6 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Create Your First Talk Show →
              </Link>
            </div>
          ) : (
            /* Talk Shows */
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Your Talk Shows
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {talkShows.length} talk show
                  {talkShows.length !== 1 ? "s" : ""} created
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {talkShows.map((talkShow) => (
                  <div
                    key={talkShow.id}
                    className="group relative min-h-80 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900 transition hover:border-zinc-300 hover:shadow-sm"
                  >
                    <Image
                      src={getShowCover(talkShow.category, talkShow.id)}
                      alt="Studio microphone background"
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#10241e] via-[#10241e]/75 to-[#10241e]/20" />
                    <div className="relative flex min-h-80 flex-col p-6 text-white">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-xl backdrop-blur-sm">🎙</div>

                        <span className="rounded-full border border-white/20 bg-black/15 px-3 py-1 text-xs font-medium capitalize text-white/90 backdrop-blur-sm">{talkShow.category}</span>
                      </div>

                      <div className="mt-auto">
                        <h3 className="text-xl font-semibold tracking-tight">{talkShow.name}</h3>

                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/72">{talkShow.description}</p>

                        <div className="mt-6 flex items-center justify-between border-t border-white/15 pt-4">
                          <span className="text-xs text-white/65">{talkShow.documentIds?.length ?? 0} selected file{(talkShow.documentIds?.length ?? 0) === 1 ? "" : "s"}</span>

                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => handleDeleteTalkShow(talkShow)} disabled={deletingTalkShowId === talkShow.id} className="text-xs font-medium text-[#ffb09d] transition hover:text-white disabled:opacity-50">
                              {deletingTalkShowId === talkShow.id ? "Deleting…" : "Delete"}
                            </button>
                            <Link href={`/talk-shows/${talkShow.id}`} className="text-sm font-medium text-white hover:underline">Open →</Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
