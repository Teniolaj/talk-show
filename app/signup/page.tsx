"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import BrandVisual from "../Components/brand-visual";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = getSupabaseBrowserClient();
    const { error: signUpError } = await supabase.auth.signUp({ email, password });

    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }

    setSubmitted(true);
    setSubmitting(false);
  }

  async function handleGoogleSignIn() {
    setError(null);
    const supabase = getSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) setError(oauthError.message);
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-5">
        <div className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-zinc-900">Check your email</h1>
          <p className="mt-2 text-sm text-zinc-500">
            We sent a confirmation link to <span className="font-medium">{email}</span>. Click it
            to finish creating your account.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-zinc-900 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page grid min-h-screen lg:grid-cols-2">
      <BrandVisual />
      <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div className="auth-card w-full max-w-md p-8 sm:p-10">
        <div className="mb-9">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ef6a4b] text-sm font-bold text-white">T</div>
          <p className="mt-7 text-xs font-semibold uppercase tracking-[0.22em] text-[#b65d49]">Start creating</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">Your next great show starts here.</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Set up your studio, bring in your context, and go live with confidence.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-900">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-900">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs text-zinc-400">or</span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="mt-4 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
        >
          Continue with Google
        </button>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-zinc-900 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      </main>
    </div>
  );
}
