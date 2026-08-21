"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "../../Components/sidebar";

type TalkShow = {
  id: string;
  name: string;
  description: string;
  category: string;
  createdAt: string;
};

export default function TalkShowDetails() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [talkShow, setTalkShow] = useState<TalkShow | null>(null);

  useEffect(() => {
    const savedTalkShows = JSON.parse(
      localStorage.getItem("talkShows") || "[]"
    );

    const selectedTalkShow = savedTalkShows.find(
      (show: TalkShow) => show.id === id
    );

    setTalkShow(selectedTalkShow || null);
  }, [id]);

  if (!talkShow) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Sidebar />

        <main className="ml-64 flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-zinc-900">
              Talk show not found
            </h1>

            <Link
              href="/talk-shows"
              className="mt-4 inline-block text-sm font-medium text-zinc-600 hover:text-zinc-900"
            >
              ← Back to Talk Shows
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-64 min-h-screen">
        {/* Header */}
        <header className="border-b border-zinc-200 bg-white px-10 py-5">
          <Link
            href="/talk-shows"
            className="text-sm text-zinc-500 transition hover:text-zinc-900"
          >
            ← Back to Talk Shows
          </Link>

          <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-center">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  {talkShow.name}
                </h1>

                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium capitalize text-zinc-600">
                  {talkShow.category}
                </span>
              </div>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                {talkShow.description}
              </p>
            </div>

            <button
  type="button"
  onClick={() => router.push(`/live?talkShowId=${talkShow.id}`)}
  className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
>
  Start Live Session →
</button>
          </div>
        </header>

        <div className="px-10 py-10">
          {/* Overview */}
          <section>
            <h2 className="text-lg font-semibold text-zinc-900">
              Overview
            </h2>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-sm text-zinc-500">Content Sources</p>

                <p className="mt-2 text-3xl font-semibold text-zinc-900">
                  0
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  No content added yet
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-sm text-zinc-500">Live Sessions</p>

                <p className="mt-2 text-3xl font-semibold text-zinc-900">
                  0
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  No sessions yet
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-sm text-zinc-500">Status</p>

                <p className="mt-2 text-xl font-semibold text-zinc-900">
                  Ready
                </p>

                <p className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Ready for content
                </p>
              </div>
            </div>
          </section>

          {/* Content Sources */}
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Content Sources
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Content Talkshow can use during live detection.
                </p>
              </div>

              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
              >
                + Add Content
              </button>
            </div>

            <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
                📚
              </div>

              <h3 className="mt-4 text-base font-semibold text-zinc-900">
                No content sources yet
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Add documents or other supported content to give your
                talk show information to work with during live sessions.
              </p>

              <button
                type="button"
                className="mt-5 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Add Your First Content
              </button>
            </div>
          </section>

          {/* Live Session */}
          <section className="mt-10 pb-10">
            <div className="rounded-3xl bg-zinc-900 p-8 text-white">
              <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                    Live Session
                  </p>

                  <h2 className="mt-2 text-xl font-semibold">
                    Ready to start your session?
                  </h2>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                    Once you've added content, you can start a live
                    session and let Talkshow assist with relevant
                    information.
                  </p>
                </div>

                <button
  type="button"
  onClick={() => router.push(`/live?talkShowId=${talkShow.id}`)}
  className="shrink-0 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
>
  Start Live Session →
</button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}