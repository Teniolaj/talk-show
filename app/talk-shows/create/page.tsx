"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../Components/sidebar";

export default function CreateTalkShow() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);

  function handleCreate() {
    if (!name.trim() || !description.trim() || !category) {
      alert("Please fill in all the required fields.");
      return;
    }

    setCreating(true);

    const newTalkShow = {
      id: Date.now().toString(),
      name: name.trim(),
      description: description.trim(),
      category,
      createdAt: new Date().toISOString(),
    };

    const existingTalkShows = JSON.parse(
      localStorage.getItem("talkShows") || "[]"
    );

    localStorage.setItem(
      "talkShows",
      JSON.stringify([...existingTalkShows, newTalkShow])
    );

    router.push("/talk-shows");
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-64 min-h-screen">
        {/* Header */}
        <header className="border-b border-zinc-200 bg-white px-10 py-5">
          <div>
            <Link
              href="/talk-shows"
              className="text-sm text-zinc-500 transition hover:text-zinc-900"
            >
              ← Back to Talk Shows
            </Link>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900">
              Create Talk Show
            </h1>

            <p className="mt-1 text-sm text-zinc-500">
              Set up your talk show and prepare it for live sessions.
            </p>
          </div>
        </header>

        {/* Form */}
        <div className="px-10 py-10">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-3xl border border-zinc-200 bg-white p-8">
              {/* Basic Information */}
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Basic Information
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Tell us a little about the talk show you&apos;re creating.
                </p>
              </div>

              <div className="mt-8 space-y-6">
                {/* Name */}
                <div>
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-medium text-zinc-900"
                  >
                    Talk Show Name
                  </label>

                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Technology Today"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900"
                  />
                </div>

                {/* Description */}
                <div>
                  <label
                    htmlFor="description"
                    className="mb-2 block text-sm font-medium text-zinc-900"
                  >
                    Description
                  </label>

                  <textarea
                    id="description"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Briefly describe what this talk show is about..."
                    className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900"
                  />
                </div>

                {/* Category */}
                <div>
                  <label
                    htmlFor="category"
                    className="mb-2 block text-sm font-medium text-zinc-900"
                  >
                    Category
                  </label>

                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    <option value="technology">Technology</option>
                    <option value="business">Business</option>
                    <option value="education">Education</option>
                    <option value="entertainment">Entertainment</option>
                    <option value="news">News</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Content */}
                <div className="border-t border-zinc-100 pt-8">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Content Sources
                  </h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    Add the documents and content Talkshow should use during
                    live detection.
                  </p>

                  <div className="mt-5 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-6 text-center">
                    <div className="text-2xl">📚</div>

                    <p className="mt-3 text-sm font-medium text-zinc-800">
                      No content added yet
                    </p>

                    <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">
                      You can add PDFs and other supported content after
                      creating your talk show.
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-6">
                  <Link
                    href="/talk-shows"
                    className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    Cancel
                  </Link>

                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Talk Show"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}