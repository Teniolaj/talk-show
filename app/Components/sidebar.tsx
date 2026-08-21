"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/user-display";

export default function Sidebar() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);

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

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-zinc-200 bg-white">
      {/* Logo */}
      <div className="flex h-20 items-center px-7">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white">
            T
          </div>

          <span className="text-xl font-semibold tracking-tight text-zinc-900">
            Talkshow
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
          Workspace
        </p>

        <div className="space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl bg-zinc-100 px-3 py-3 text-sm font-medium text-zinc-900"
          >
            <span className="text-base">⌂</span>
            Dashboard
          </Link>

          <Link
            href="/talk-shows"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <span className="text-base">◉</span>
            Talk Shows
          </Link>

          <Link
            href="/content-library"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <span className="text-base">▣</span>
            Content Library
          </Link>

          <Link
            href="/sessions"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <span className="text-base">◷</span>
            Live Sessions
          </Link>
        </div>

        <p className="mb-3 mt-10 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
          Manage
        </p>

        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
        >
          <span className="text-base">⚙</span>
          Settings
        </Link>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-zinc-200 p-4">
        <div className="mb-3 rounded-xl bg-zinc-50 p-4">
          <p className="text-xs font-medium text-zinc-400">
            LIVE ASSISTANT
          </p>

          <p className="mt-1 text-sm font-medium text-zinc-800">
            Ready for your next show?
          </p>

          <Link
            href="/live"
            className="mt-3 flex w-full items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800"
          >
            Start Live Session
          </Link>
        </div>

        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700">
            {getInitials(fullName, email)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">
              {email ?? "Not signed in"}
            </p>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
