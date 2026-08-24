"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, FileCheck2, Library, Mic } from "lucide-react";
import Sidebar from "./Components/sidebar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/user-display";
import { getTalkShows, type TalkShow } from "@/lib/talk-shows";

type LibraryDocument = {
  id: string;
  status: string;
};

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [talkShows, setTalkShows] = useState<TalkShow[]>([]);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setFullName((data.session?.user.user_metadata?.full_name as string | undefined) ?? null);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
      setFullName((session?.user?.user_metadata?.full_name as string | undefined) ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function loadWorkspace() {
      const [shows, documentsResponse] = await Promise.all([
        getTalkShows(),
        fetch("/api/documents"),
      ]);

      setTalkShows(shows);
      if (documentsResponse.ok) {
        const data = await documentsResponse.json();
        setDocuments(data.documents ?? []);
      }
    }

    loadWorkspace().catch((error) =>
      console.error("Failed to load dashboard workspace", error)
    );
  }, []);

  const readyDocuments = documents.filter((document) => document.status === "ready").length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-64 min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-10 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Welcome to Talkshow 👋
            </h1>

            <p className="mt-1 text-sm text-zinc-500">
              Your live presentation assistant is ready to get started.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50">
              <Bell className="h-5 w-5" />
            </button>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                {getInitials(fullName, email)}
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-12 z-10 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                  <p className="truncate px-3 py-2 text-sm text-zinc-500">{email ?? "Not signed in"}</p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="px-10 py-8">
          {/* Overview */}
          <section>
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-zinc-900">
                Overview
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                {talkShows.length === 0
                  ? "Create a talk show and add PDFs to get started."
                  : `${talkShows.length} talk show${talkShows.length === 1 ? "" : "s"} and ${documents.length} document${documents.length === 1 ? "" : "s"} in your workspace.`}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {/* Talk Shows */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">Talk Shows</p>

                    <p className="mt-2 text-3xl font-semibold text-zinc-900">
                      {talkShows.length}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <Mic className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-4 text-xs text-zinc-400">
                  {talkShows.length === 0
                    ? "No talk shows created yet"
                    : `${talkShows.length} created`}
                </p>
              </div>

              {/* Content */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">
                      Content Sources
                    </p>

                    <p className="mt-2 text-3xl font-semibold text-zinc-900">
                      {documents.length}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Library className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-4 text-xs text-zinc-400">
                  {documents.length === 0
                    ? "No files in your library"
                    : `${documents.length} private file${documents.length === 1 ? "" : "s"}`}
                </p>
              </div>

              {/* Sessions */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">
                      Ready Files
                    </p>

                    <p className="mt-2 text-3xl font-semibold text-zinc-900">
                      {readyDocuments}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <FileCheck2 className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-4 text-xs text-zinc-400">
                  {readyDocuments === 0
                    ? "Waiting for uploads"
                    : "Ready to use in a talk show"}
                </p>
              </div>

              {/* Status */}
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">
                      System Status
                    </p>

                    <p className="mt-2 text-xl font-semibold text-zinc-900">
                      Ready
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  System is ready
                </p>
              </div>
            </div>
          </section>

          {/* Get Started */}
          <section className="mt-8">
            <div className="rounded-3xl bg-zinc-900 p-8 text-white">
              <div className="flex flex-col justify-between gap-8 md:flex-row md:items-center">
                <div className="max-w-2xl">
                  <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                    Get Started
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    {talkShows.length === 0 ? "Create your first talk show" : "Continue building your workspace"}
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    Add PDFs to your private library, select the right ones for each
                    talk show, and prepare for live sessions.
                  </p>
                </div>

                <Link
                  href="/talk-shows"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
                >
                  {talkShows.length === 0 ? "Create Talk Show →" : "Manage Talk Shows →"}
                </Link>
              </div>
            </div>
          </section>

          {/* Empty Talk Shows */}
          <section className="mt-10">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-zinc-900">
                Your Talk Shows
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Your created talk shows will appear here.
              </p>
            </div>

            {talkShows.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
                🎙
              </div>

              <h3 className="mt-4 text-base font-semibold text-zinc-900">
                No talk shows yet
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Create your first talk show to start organizing your
                content and preparing for live sessions.
              </p>

              <Link
                href="/talk-shows"
                className="mt-5 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Create Talk Show
              </Link>
            </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {talkShows.slice(0, 3).map((talkShow) => (
                  <Link
                    key={talkShow.id}
                    href={`/talk-shows/${talkShow.id}`}
                    className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-lg">🎙</span>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium capitalize text-zinc-600">
                        {talkShow.category}
                      </span>
                    </div>
                    <h3 className="mt-4 font-semibold text-zinc-900">{talkShow.name}</h3>
                    <p className="mt-2 text-sm text-zinc-500">
                      {talkShow.documentIds?.length ?? 0} selected document{(talkShow.documentIds?.length ?? 0) === 1 ? "" : "s"}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Empty Activity */}
          <section className="mt-10 pb-10">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-zinc-900">
                Recent Activity
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Your recent activity will appear here.
              </p>
            </div>

            <div className="flex min-h-32 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6">
              <p className="text-sm text-zinc-400">
                No activity yet.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
