"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCircle2, FileCheck2, FileText, Library, Mic, Radio } from "lucide-react";
import Sidebar from "./Components/sidebar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/user-display";
import { getTalkShows, type TalkShow } from "@/lib/talk-shows";
import { getStoredActivities, type StoredActivity } from "@/lib/recent-activity";
import { getShowCover } from "@/lib/show-cover";

type LibraryDocument = {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
};

type RecentActivity = {
  id: string;
  type: "document" | "talk-show" | StoredActivity["type"];
  title: string;
  createdAt: string;
};

function formatActivityTime(dateString: string) {
  const date = new Date(dateString);
  const difference = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(difference / 60_000));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [talkShows, setTalkShows] = useState<TalkShow[]>([]);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [storedActivities, setStoredActivities] = useState<StoredActivity[]>([]);
  const [activityExpanded, setActivityExpanded] = useState(false);
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
      const [shows, documentsResponse, activities] = await Promise.all([
        getTalkShows(),
        fetch("/api/documents"),
        getStoredActivities(),
      ]);

      setTalkShows(shows);
      setStoredActivities(activities);
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
  const recentActivities: RecentActivity[] = [
    ...documents.map((document) => ({
      id: `document-${document.id}`,
      type: "document" as const,
      title: `${document.file_name} was added to your Content Library`,
      createdAt: document.created_at,
    })),
    ...talkShows.map((talkShow) => ({
      id: `talk-show-${talkShow.id}`,
      type: "talk-show" as const,
      title: `${talkShow.name} was created`,
      createdAt: talkShow.createdAt,
    })),
    ...storedActivities,
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleActivities = activityExpanded ? recentActivities : recentActivities.slice(0, 5);

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
            <div className="dashboard-feature overflow-hidden rounded-3xl bg-zinc-900 text-white">
              <div className="grid md:grid-cols-[1.15fr_0.85fr]">
              <div className="p-8 md:p-10">
                <div className="max-w-2xl">
                  <p className="text-xs font-medium uppercase tracking-widest text-zinc-400">
                    Your studio, in motion
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
                  className="mt-7 inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
                >
                  {talkShows.length === 0 ? "Create Talk Show →" : "Manage Talk Shows →"}
                </Link>
              </div>
              <div className="relative hidden min-h-72 md:block">
                <Image
                  src="https://images.unsplash.com/photo-1756489947258-b7774b7671ff?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=85&w=1200"
                  alt="Microphone in a live studio"
                  fill
                  sizes="(max-width: 768px) 100vw, 35vw"
                  className="object-cover opacity-90"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#18332b]/70 to-transparent" />
                <p className="absolute bottom-7 left-7 rounded-full border border-white/25 bg-black/20 px-3 py-1.5 text-xs font-medium text-white/90 backdrop-blur">Ready when you are</p>
              </div>
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
                    className="group relative min-h-48 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900 p-5 text-white transition hover:border-zinc-300 hover:shadow-sm"
                  >
                    <Image
                      src={getShowCover(talkShow.category, talkShow.id)}
                      alt="Studio microphone background"
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover transition duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#10241e] via-[#10241e]/75 to-[#10241e]/20" />
                    <div className="relative">
                    <div className="flex items-center justify-between">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-lg backdrop-blur-sm">🎙</span>
                      <span className="rounded-full border border-white/20 bg-black/15 px-2.5 py-1 text-xs font-medium capitalize text-white/90 backdrop-blur-sm">
                        {talkShow.category}
                      </span>
                    </div>
                    <h3 className="mt-4 font-semibold">{talkShow.name}</h3>
                    <p className="mt-2 text-sm text-white/70">
                      {talkShow.documentIds?.length ?? 0} selected document{(talkShow.documentIds?.length ?? 0) === 1 ? "" : "s"}
                    </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Recent Activity */}
          <section className="mt-10 pb-10">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Recent Activity</h2>
                <p className="mt-1 text-sm text-zinc-500">The latest changes in your workspace.</p>
              </div>
              {recentActivities.length > 5 && (
                <span className="hidden rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 sm:block">
                  {recentActivities.length} updates
                </span>
              )}
            </div>

            {recentActivities.length === 0 ? (
              <div className="flex min-h-32 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-6">
                <p className="text-sm text-zinc-400">No activity yet. Upload content or create a talk show to get started.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm shadow-zinc-200/40">
                <div className="divide-y divide-zinc-100 px-5">
                  {visibleActivities.map((activity) => {
                    const Icon = activity.type === "document" ? FileText : activity.type === "talk-show" ? Mic : activity.type === "documents-added" ? Library : Radio;
                    const iconClass = activity.type === "document" ? "bg-blue-50 text-blue-600" : activity.type === "talk-show" ? "bg-violet-50 text-violet-600" : activity.type === "documents-added" ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600";

                    return (
                      <div key={activity.id} className="flex items-center gap-3 py-3.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-800">{activity.title}</p>
                        </div>
                        <p className="shrink-0 text-xs text-zinc-400">{formatActivityTime(activity.createdAt)}</p>
                      </div>
                    );
                  })}
                </div>
                {recentActivities.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setActivityExpanded((expanded) => !expanded)}
                    className="w-full border-t border-zinc-100 px-5 py-3 text-center text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
                  >
                    {activityExpanded ? "Show less" : `Show all activity (${recentActivities.length})`}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
