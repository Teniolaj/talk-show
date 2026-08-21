"use client";

import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type FileResult = {
  filename: string;
  documentId: string;
  chunkCount: number;
  error?: string;
};

export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadForm />
    </Suspense>
  );
}

function UploadForm() {
  const searchParams = useSearchParams();
  const repoId = searchParams.get("repo_id");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (files.length === 0) return;

    setUploading(true);
    setError(null);
    setResults(null);

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      if (repoId) formData.append("repo_id", repoId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
      } else {
        setResults(data.results);
      }
    } catch {
      setError("Upload request failed — check server logs");
    } finally {
      setUploading(false);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-xl font-semibold">Talkshow — Upload Source Material</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Upload the files for this presentation. Each file is sent to the ingestion workflow to be
        chunked and embedded, then becomes matchable from the{" "}
        <a href="/live" className="underline">
          live
        </a>{" "}
        page.
      </p>

      <div className="mt-6">
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="hidden"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            onClick={() => inputRef.current?.click()}
            className="w-fit rounded-md border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Choose files
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="w-fit rounded-md bg-zinc-900 px-5 py-2.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {uploading ? "Uploading & embedding…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
          </button>
        </div>

        {files.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <span className="truncate">{f.name}</span>
                <button
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {results && (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Results</div>
          <ul className="mt-2 space-y-2">
            {results.map((r) => (
              <li key={r.documentId} className="text-sm">
                <span className="font-medium">{r.filename}</span>
                {r.error ? (
                  <span className="text-red-500"> — {r.error}</span>
                ) : (
                  <span className="text-zinc-500"> — {r.chunkCount} chunks stored</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
