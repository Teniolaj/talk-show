"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/user-display";

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setFullName(
        (data.session?.user.user_metadata?.full_name as string | undefined) ??
          null
      );
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setEmail(session?.user?.email ?? null);
        setFullName(
          (session?.user?.user_metadata?.full_name as string | undefined) ??
            null
        );
      }
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function navClass(isActive: boolean) {
    return `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
      isActive
        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
    }`;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="fixed left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-lg text-zinc-900 shadow-sm lg:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        aria-label="Open navigation menu"
      >
        ☰
      </button>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-zinc-950/35 lg:hidden"
        />
      )}

    <aside className={`fixed left-0 top-0 z-40 flex h-screen w-72 -translate-x-full flex-col border-r border-zinc-200 bg-white transition-transform duration-200 lg:w-64 lg:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${mobileMenuOpen ? "translate-x-0" : ""}`}>
      {/* Logo */}
      <div className="flex h-20 items-center justify-between px-7">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white dark:bg-white dark:text-zinc-900">
            T
          </div>

          <span className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">
            Talkshow
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-zinc-500 hover:bg-zinc-100 lg:hidden dark:hover:bg-zinc-800"
          aria-label="Close navigation menu"
        >
          ×
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <p className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-zinc-400">
          Workspace
        </p>

        <div className="space-y-1">
          <Link href="/" className={navClass(pathname === "/")}>
            <span className="text-base">⌂</span>
            Dashboard
          </Link>

          <Link
            href="/talk-shows"
            className={navClass(pathname.startsWith("/talk-shows"))}
          >
            <span className="text-base">◉</span>
            Talk Shows
          </Link>

          <Link
            href="/content-library"
            className={navClass(pathname === "/content-library")}
          >
            <span className="text-base">▣</span>
            Content Library
          </Link>

          <Link
            href="/live"
            className={navClass(pathname === "/live")}
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
          className={navClass(pathname === "/settings")}
        >
          <span className="text-base">⚙</span>
          Settings
        </Link>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
          <p className="text-xs font-medium text-zinc-400">
            LIVE ASSISTANT
          </p>

          <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Ready for your next show?
          </p>

          <Link
            href="/live"
            className="mt-3 flex w-full items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Start Live Session
          </Link>
        </div>

        <div className="flex items-center gap-3 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {getInitials(fullName, email)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
              {email ?? "Not signed in"}
            </p>

            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs text-zinc-500 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
