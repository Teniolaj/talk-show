"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "../../Components/sidebar";
import { getTalkShow, type TalkShow } from "@/lib/talk-shows";

type RepoDocument = {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
};

export default function TalkShowDetails() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [talkShow, setTalkShow] = useState<TalkShow | null>(null);
  const [talkShowLoaded, setTalkShowLoaded] = useState(false);

  const [documents, setDocuments] = useState<RepoDocument[]>([]);
  const [showUploader, setShowUploader] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getTalkShow(id).then((show) => {
      setTalkShow(show);
      setTalkShowLoaded(true);
    });
  }, [id]);

  const fetchDocuments = useCallback(async (): Promise<RepoDocument[]> => {
    if (!talkShow) return [];
    const res = await fetch(`/api/documents?repo_id=${talkShow.id}`);
    const data = await res.json();
    return res.ok ? (data.documents ?? []) : [];
  }, [talkShow]);

  useEffect(() => {
    fetchDocuments().then(setDocuments);
  }, [fetchDocuments]);

  async function handleUpload() {
    if (!talkShow || files.length === 0) return;

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      formData.append("repo_id", talkShow.id);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setUploadError(data.error ?? "Upload failed");
      } else {
        const failed = (data.results ?? []).filter((r: { error?: string }) => r.error);
        if (failed.length > 0) {
          setUploadError(failed.map((r: { filename: string; error?: string }) => `${r.filename}: ${r.error}`).join("; "));
        }
        setDocuments(await fetchDocuments());
      }
    } catch {
      setUploadError("Upload request failed — check server logs");
    } finally {
      setUploading(false);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (!talkShow) {
    if (!talkShowLoaded) return null;

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
                  {documents.length}
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  {documents.length === 0
                    ? "No content added yet"
                    : `${documents.filter((d) => d.status === "ready").length} ready`}
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
                onClick={() => setShowUploader((v) => !v)}
                className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
              >
                + Add Content
              </button>
            </div>

            {showUploader && (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-white p-6">
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="hidden"
                />

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="w-fit rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
                  >
                    Choose files
                  </button>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={files.length === 0 || uploading}
                    className="w-fit rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {uploading ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
                  </button>
                </div>

                {files.length > 0 && (
                  <ul className="mt-4 space-y-1.5">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
                      >
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-900"
                          aria-label={`Remove ${f.name}`}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {uploadError && <p className="mt-3 text-sm text-red-500">{uploadError}</p>}
              </div>
            )}

            {documents.length === 0 ? (
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
                  onClick={() => setShowUploader(true)}
                  className="mt-5 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
                >
                  Add Your First Content
                </button>
              </div>
            ) : (
              <div className="mt-5 divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between px-5 py-4">
                    <span className="text-sm font-medium text-zinc-900">{doc.file_name}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        doc.status === "ready"
                          ? "bg-green-100 text-green-700"
                          : doc.status === "error"
                            ? "bg-red-100 text-red-700"
                            : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
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