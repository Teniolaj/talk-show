"use client";

import { useEffect, useState } from "react";
import Sidebar from "../Components/sidebar";
import { useTheme } from "../Components/theme-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  defaultLivePreferences,
  readLivePreferences,
  saveLivePreferences,
  type LivePreferences,
} from "@/lib/live-preferences";

type Notice = { type: "success" | "error"; message: string } | null;

export default function SettingsPage() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [preferences, setPreferences] = useState<LivePreferences>(defaultLivePreferences);
  const [notice, setNotice] = useState<Notice>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setFullName((data.user?.user_metadata?.full_name as string | undefined) ?? "");
      setEmail(data.user?.email ?? "");
    });
    queueMicrotask(() => setPreferences(readLivePreferences()));
  }, []);

  function updatePreference(key: keyof LivePreferences) {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    saveLivePreferences(next);
  }

  async function saveProfile() {
    setSavingProfile(true);
    setNotice(null);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    setSavingProfile(false);

    if (error) {
      setNotice({ type: "error", message: error.message });
      return;
    }

    setEditingProfile(false);
    setNotice({ type: "success", message: "Profile saved." });
  }

  async function changePassword() {
    setNotice(null);
    if (newPassword.length < 6) {
      setNotice({ type: "error", message: "Use a password with at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ type: "error", message: "The passwords do not match." });
      return;
    }

    setChangingPassword(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);

    if (error) {
      setNotice({ type: "error", message: error.message });
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setNotice({ type: "success", message: "Password updated." });
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <header className="border-b border-zinc-200 bg-white px-10 py-5">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage your account, appearance, and live-session preferences.</p>
        </header>

        <div className="mx-auto max-w-4xl px-10 py-10">
          {notice && (
            <div className={`mb-6 rounded-xl px-4 py-3 text-sm ${notice.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              {notice.message}
            </div>
          )}

          <SettingsSection title="Account" description="Keep the details connected to your Talkshow account up to date.">
            <div className="divide-y divide-zinc-100">
              <div className="p-6">
                <p className="text-sm font-medium text-zinc-900">Email address</p>
                <p className="mt-1 text-sm text-zinc-500">{email || "Loading account email…"}</p>
              </div>
              <div className="p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Profile name</p>
                    <p className="mt-1 text-sm text-zinc-500">This is shown in your workspace.</p>
                  </div>
                  {!editingProfile && <button type="button" onClick={() => setEditingProfile(true)} className="button-secondary">Edit profile</button>}
                </div>
                {editingProfile && (
                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" className="field flex-1" />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingProfile(false)} className="button-secondary">Cancel</button>
                      <button type="button" onClick={saveProfile} disabled={savingProfile} className="button-primary">{savingProfile ? "Saving…" : "Save"}</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6">
                <div>
                  <p className="text-sm font-medium text-zinc-900">Password</p>
                  <p className="mt-1 text-sm text-zinc-500">Set a new password for signing in to Talkshow.</p>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" className="field" />
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="field" />
                </div>
                <button type="button" onClick={changePassword} disabled={changingPassword || !newPassword || !confirmPassword} className="button-primary mt-4">
                  {changingPassword ? "Updating…" : "Update password"}
                </button>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Appearance" description="Choose the appearance used across all of Talkshow.">
            <div className="grid gap-3 p-6 sm:grid-cols-3">
              <ThemeOption name="Light" description="Bright appearance" selected={theme === "light"} onClick={() => setTheme("light")} preview="light" />
              <ThemeOption name="Dark" description="Dark appearance" selected={theme === "dark"} onClick={() => setTheme("dark")} preview="dark" />
              <ThemeOption name="System" description="Follow device settings" selected={theme === "system"} onClick={() => setTheme("system")} preview={isDark ? "dark" : "light"} />
            </div>
          </SettingsSection>

          <SettingsSection title="Live session" description="These preferences take effect when you start your next live session.">
            <div className="divide-y divide-zinc-100">
              <PreferenceRow title="Show live transcript" description="Show the ongoing transcript in the live control room." checked={preferences.showLiveTranscript} onChange={() => updatePreference("showLiveTranscript")} />
              <PreferenceRow title="Automatic detection" description="Cross-check spoken segments against your selected content automatically." checked={preferences.automaticDetection} onChange={() => updatePreference("automaticDetection")} />
            </div>
          </SettingsSection>
        </div>
      </main>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="mb-10"><div className="mb-5"><h2 className="text-lg font-semibold text-zinc-900">{title}</h2><p className="mt-1 text-sm text-zinc-500">{description}</p></div><div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">{children}</div></section>;
}

function ThemeOption({ name, description, selected, onClick, preview }: { name: string; description: string; selected: boolean; onClick: () => void; preview: "light" | "dark" }) {
  const light = preview === "light";
  return <button type="button" onClick={onClick} className={`${light ? "theme-preview-light bg-white" : "theme-preview-dark bg-zinc-900"} rounded-xl border p-4 text-left transition ${selected ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200 hover:border-zinc-400"}`}><div className={`h-20 rounded-lg ${light ? "border border-zinc-200 bg-zinc-50" : "bg-zinc-950"}`} /><p className={`mt-3 text-sm font-medium ${light ? "text-zinc-900" : "text-white"}`}>{name}</p><p className={`mt-1 text-xs ${light ? "text-zinc-500" : "text-zinc-400"}`}>{description}</p></button>;
}

function PreferenceRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: () => void }) {
  return <div className="flex items-center justify-between gap-5 p-6"><div><p className="text-sm font-medium text-zinc-900">{title}</p><p className="mt-1 max-w-xl text-sm text-zinc-500">{description}</p></div><button type="button" role="switch" aria-checked={checked} onClick={onChange} className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-zinc-900" : "bg-zinc-200"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? "right-1" : "left-1"}`} /></button></div>;
}
