"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Sidebar from "../../Components/sidebar";
import {
  getTalkShow,
  deleteTalkShow,
  updateTalkShowDocuments,
  type TalkShow,
} from "@/lib/talk-shows";
import { recordActivity } from "@/lib/recent-activity";

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
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [savingSelection, setSavingSelection] = useState(false);
  const [deletingTalkShow, setDeletingTalkShow] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    getTalkShow(id).then((show) => {
      setTalkShow(show);
      setSelectedDocumentIds(show?.documentIds ?? []);
      setTalkShowLoaded(true);
    });
  }, [id]);

  const fetchDocuments = useCallback(async (): Promise<RepoDocument[]> => {
    const res = await fetch("/api/documents");
    const data = await res.json();
    return res.ok ? (data.documents ?? []) : [];
  }, []);

  useEffect(() => {
    fetchDocuments().then(setDocuments);
  }, [fetchDocuments]);

  async function saveDocumentSelection() {
    if (!talkShow) return;

    setSavingSelection(true);
    try {
      const addedDocumentCount = selectedDocumentIds.filter(
        (documentId) => !(talkShow.documentIds ?? []).includes(documentId)
      ).length;
      const updatedTalkShow = await updateTalkShowDocuments(
        talkShow.id,
        selectedDocumentIds
      );
      setTalkShow(updatedTalkShow);

      if (addedDocumentCount > 0) {
        await recordActivity({
          type: "documents-added",
          title: `${addedDocumentCount} document${addedDocumentCount === 1 ? " was" : "s were"} added to ${talkShow.name}`,
        });
      }
      setSelectionError(null);
    } catch (error) {
      setSelectionError(
        error instanceof Error ? error.message : "Could not save document selection."
      );
    } finally {
      setSavingSelection(false);
    }
  }

  function toggleDocument(documentId: string) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId]
    );
  }

  async function handleDeleteTalkShow() {
    if (!talkShow) return;
    if (!window.confirm(`Delete “${talkShow.name}”? Your library PDFs will not be deleted.`)) {
      return;
    }

    setDeletingTalkShow(true);
    try {
      await deleteTalkShow(talkShow.id);
      router.push("/talk-shows");
      router.refresh();
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : "Could not delete talk show.");
      setDeletingTalkShow(false);
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

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeleteTalkShow}
                disabled={deletingTalkShow}
                className="rounded-xl px-4 py-3 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
              >
                {deletingTalkShow ? "Deleting…" : "Delete talk show"}
              </button>
              <button
                type="button"
                onClick={() => router.push(`/live?talkShowId=${talkShow.id}`)}
                className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Start Live Session →
              </button>
            </div>
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
                  {selectedDocumentIds.length}
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  {selectedDocumentIds.length === 0
                    ? "No documents selected"
                    : `${documents.filter((document) => selectedDocumentIds.includes(document.id) && document.status === "ready").length} ready`}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-sm text-zinc-500">Live Sessions</p>

                <p className="mt-2 text-3xl font-semibold text-zinc-900">
                  {talkShow.sessionCount ?? 0}
                </p>

                <p className="mt-2 text-xs text-zinc-400">
                  {talkShow.sessionCount
                    ? `${talkShow.sessionCount} session${talkShow.sessionCount === 1 ? "" : "s"} completed`
                    : "No sessions yet"}
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
                  Select documents from your private library for this talk show.
                </p>
              </div>

              <Link
                href="/content-library"
                className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50"
              >
                + Add to Library
              </Link>
            </div>

            {selectionError && <p className="mt-3 text-sm text-red-500">{selectionError}</p>}

            {documents.length === 0 ? (
              <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl">
                  📚
                </div>

                <h3 className="mt-4 text-base font-semibold text-zinc-900">
                  No content sources yet
                </h3>

                <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                  Add documents to your content library to give your
                  talk show information to work with during live sessions.
                </p>

                <Link
                  href="/content-library"
                  className="mt-5 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
                >
                  Add Your First Content
                </Link>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-5 py-3">
                  <p className="text-xs font-medium text-zinc-500">
                    {selectedDocumentIds.length} selected for this talk show
                  </p>
                  <button
                    type="button"
                    onClick={saveDocumentSelection}
                    disabled={savingSelection}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {savingSelection ? "Saving…" : "Save selection"}
                  </button>
                </div>
                {documents.map((doc) => (
                  <label key={doc.id} className="flex cursor-pointer items-center justify-between gap-4 border-t border-zinc-100 px-5 py-4 first:border-t-0 hover:bg-zinc-50">
                    <span className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedDocumentIds.includes(doc.id)}
                        onChange={() => toggleDocument(doc.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                      />
                      <span className="truncate text-sm font-medium text-zinc-900">{doc.file_name}</span>
                    </span>
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
                  </label>
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
                    Once you&apos;ve added content, you can start a live
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
