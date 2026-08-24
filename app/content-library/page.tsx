"use client";

import { useEffect, useState } from "react";
import Sidebar from "../Components/sidebar";

type Document = {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
};

// Keep in sync with lib/document-ingestion.ts's MIME_TYPES_BY_EXTENSION —
// that's what the ingestion pipeline actually accepts.
const SUPPORTED_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"];
const SUPPORTED_ACCEPT = SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

function hasSupportedExtension(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return !!ext && SUPPORTED_EXTENSIONS.includes(ext);
}

export default function ContentLibrary() {
  const [showAddContent, setShowAddContent] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  useEffect(() => {
    async function loadDocuments() {
      try {
        const response = await fetch("/api/documents");

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to load documents");
        }

        setDocuments(result.documents || []);
      } catch (error) {
        console.error("Failed to load documents:", error);
      } finally {
        setLoadingDocuments(false);
      }
    }

    loadDocuments();
  }, []);

  async function handleAddContent() {
    if (files.length === 0 || uploading) return;

    const unsupported = files.filter((file) => !hasSupportedExtension(file.name));
    if (unsupported.length > 0) {
      setUploadError(`Unsupported file type. Remove: ${unsupported.map((file) => file.name).join(", ")}`);
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();

      files.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      const failed = (result.results ?? []).filter(
        (fileResult: { error?: string }) => fileResult.error
      );
      if (failed.length > 0) {
        throw new Error(
          failed
            .map((fileResult: { filename: string; error?: string }) => `${fileResult.filename}: ${fileResult.error}`)
            .join("; ")
        );
      }

      setFiles([]);
      setShowAddContent(false);

      // Refresh documents after upload
      const documentsResponse = await fetch("/api/documents");

      const documentsResult = await documentsResponse.json();

      if (documentsResponse.ok) {
        setDocuments(documentsResult.documents || []);
      }
    } catch (error) {
      console.error("Upload failed:", error);

      setUploadError(
        error instanceof Error
          ? error.message
          : "Something went wrong while uploading."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteDocument(document: Document) {
    const confirmed = window.confirm(
      `Delete “${document.file_name}”? It will be removed from your library and from every talk show that uses it.`
    );
    if (!confirmed) return;

    setDeletingDocumentId(document.id);
    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: document.id }),
      });
      const responseText = await response.text();
      let result: { error?: string } | null = null;
      try {
        result = responseText ? (JSON.parse(responseText) as { error?: string }) : null;
      } catch {
        // The status below still gives a useful message if a proxy returns HTML.
      }
      if (!response.ok) {
        throw new Error(result?.error || `Could not delete document (status ${response.status})`);
      }

      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not delete document.");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-64 min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-10 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Content Library
            </h1>

            <p className="mt-1 text-sm text-zinc-500">
              Your private document library. Choose which documents each talk show can use.
            </p>
          </div>

          <button
            onClick={() => setShowAddContent(true)}
            className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            + Add Content
          </button>
        </header>

        {/* Content */}
        <div className="px-10 py-10">
          {loadingDocuments ? (
            <div className="flex min-h-[520px] items-center justify-center rounded-3xl border border-zinc-200 bg-white">
              <p className="text-sm text-zinc-500">
                Loading content...
              </p>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-300 bg-white px-6 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-100 text-3xl">
                📄
              </div>

              <h2 className="mt-6 text-xl font-semibold text-zinc-900">
                No content yet
              </h2>

              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Add documents to your content library so they can be used
                during live sessions and detected automatically.
              </p>

              <button
                onClick={() => setShowAddContent(true)}
                className="mt-6 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Add Your First Content →
              </button>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Your Content
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  {documents.length} document
                  {documents.length !== 1 ? "s" : ""} in your library
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-xl">
                        📄
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          document.status === "ready"
                            ? "bg-green-50 text-green-700"
                            : document.status === "error"
                            ? "bg-red-50 text-red-700"
                            : "bg-yellow-50 text-yellow-700"
                        }`}
                      >
                        {document.status}
                      </span>
                    </div>

                    <h3 className="mt-5 truncate text-lg font-semibold text-zinc-900">
                      {document.file_name}
                    </h3>

                    <p className="mt-2 text-sm text-zinc-500">
                      Added{" "}
                      {new Date(
                        document.created_at
                      ).toLocaleDateString()}
                    </p>

                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(document)}
                      disabled={deletingDocumentId === document.id}
                      className="mt-5 text-sm font-medium text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingDocumentId === document.id ? "Deleting…" : "Delete file"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add Content Modal */}
      {showAddContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  Add Content
                </h2>

                <p className="mt-1 text-sm text-zinc-500">
                  Add one or more documents to your content library.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowAddContent(false);
                  setFiles([]);
                  setUploadError(null);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                ×
              </button>
            </div>

            {/* File Upload */}
            <div className="mt-7 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
                📄
              </div>

              <h3 className="mt-4 font-medium text-zinc-900">
                {files.length > 0 ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Upload documents"}
              </h3>

              <p className="mt-1 text-sm text-zinc-500">
                PDF, Word, PowerPoint, and Excel files are supported
              </p>

              <label className="mt-5 inline-block cursor-pointer rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100">
                {files.length > 0 ? "Choose More Files" : "Choose Files"}

                <input
                  type="file"
                  multiple
                  accept={SUPPORTED_ACCEPT}
                  className="hidden"
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? []);

                    if (selected.length > 0) {
                      setFiles((current) => [...current, ...selected]);
                    }
                  }}
                />
              </label>

              {files.length > 0 && (
                <ul className="mt-5 space-y-1.5 text-left">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm text-zinc-900"
                    >
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                        className="ml-3 shrink-0 text-zinc-400 hover:text-zinc-900"
                        aria-label={`Remove ${file.name}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {uploadError && <p className="mt-4 text-sm text-red-500">{uploadError}</p>}
            </div>

            {/* Actions */}
            <div className="mt-7 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddContent(false);
                  setFiles([]);
                  setUploadError(null);
                }}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
              >
                Cancel
              </button>

              <button
                onClick={handleAddContent}
                disabled={files.length === 0 || uploading}
                className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
                  files.length > 0 && !uploading
                    ? "bg-zinc-900 text-white hover:bg-zinc-800"
                    : "cursor-not-allowed bg-zinc-200 text-zinc-400"
                }`}
              >
                {uploading ? "Uploading..." : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
