"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type UploadStatus = "queued" | "uploading" | "processing" | "ready" | "failed";

type UploadItem = {
  id: string;
  file: File;
  status: UploadStatus;
  chunkCount?: number;
  error?: string;
};

const CONCURRENCY = 3;

const STATUS_LABEL: Record<UploadStatus, string> = {
  queued: "Queued",
  uploading: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

const STATUS_CLASS: Record<UploadStatus, string> = {
  queued: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  uploading: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  processing: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  ready: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isProcessing = items.some(
    (item) => item.status === "queued" || item.status === "uploading" || item.status === "processing"
  );

  function addFiles(newFiles: File[]) {
    if (newFiles.length === 0) return;
    setPendingFiles((prev) => [...prev, ...newFiles]);
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  const processItem = useCallback(
    async (item: UploadItem) => {
      updateItem(item.id, { status: "uploading" });

      try {
        const formData = new FormData();
        formData.append("file", item.file);
        if (repoId) formData.append("repo_id", repoId);

        const startRes = await fetch("/api/upload/start", { method: "POST", body: formData });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.error ?? "Upload failed");

        updateItem(item.id, { status: "processing" });

        const ingestRes = await fetch("/api/upload/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: startData.documentId, fileUrl: startData.fileUrl }),
        });
        const ingestData = await ingestRes.json();
        if (!ingestRes.ok) throw new Error(ingestData.error ?? "Processing failed");

        updateItem(item.id, { status: "ready", chunkCount: ingestData.chunksCreated ?? 0 });
      } catch (err) {
        updateItem(item.id, {
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [repoId]
  );

  async function runQueue(queueItems: UploadItem[]) {
    const queue = [...queueItems];

    async function worker() {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;
        await processItem(item);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  }

  function handleUpload() {
    if (pendingFiles.length === 0 || isProcessing) return;

    const newItems: UploadItem[] = pendingFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "queued",
    }));

    setItems((prev) => [...prev, ...newItems]);
    setPendingFiles([]);
    if (inputRef.current) inputRef.current.value = "";

    runQueue(newItems);
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <h1 className="text-xl font-semibold">Talkshow — Upload Source Material</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Upload PDF, DOCX, or PPTX files for this presentation. PowerPoint decks are automatically split into searchable slides. Up to {CONCURRENCY} process at once;
        each is chunked and embedded independently, then becomes matchable from the{" "}
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
          accept=".pdf,.doc,.docx,.ppt,.pptx"
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
          className="hidden"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(Array.from(e.dataTransfer.files ?? []));
          }}
          className={`rounded-lg border-2 border-dashed px-5 py-8 text-center transition ${
            dragOver
              ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
              : "border-zinc-200 dark:border-zinc-700"
          }`}
        >
          <p className="text-sm text-zinc-500">Drag and drop files here, or</p>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-3 w-fit rounded-md border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Choose files
          </button>
        </div>

        {pendingFiles.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {pendingFiles.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <span className="truncate">{f.name}</span>
                <button
                  onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                  className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {pendingFiles.length > 0 && (
          <button
            onClick={handleUpload}
            disabled={isProcessing}
            className="mt-4 w-fit rounded-md bg-zinc-900 px-5 py-2.5 text-sm text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Upload {pendingFiles.length} file{pendingFiles.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-6 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Processing ({items.filter((i) => i.status === "ready").length}/{items.length} ready)
          </div>
          <ul className="mt-2 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="truncate font-medium">{item.file.name}</span>
                  {item.status === "ready" && (
                    <span className="text-zinc-500"> — {item.chunkCount ?? 0} chunks stored</span>
                  )}
                  {item.status === "failed" && item.error && (
                    <span className="text-red-500"> — {item.error}</span>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[item.status]}`}
                >
                  {STATUS_LABEL[item.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
