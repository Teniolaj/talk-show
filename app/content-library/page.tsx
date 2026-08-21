"use client";

import { useState } from "react";
import Sidebar from "../Components/sidebar";

export default function ContentLibrary() {
  const [showAddContent, setShowAddContent] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
              Manage the content used by your talk shows.
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
                  Add a document to your content library.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowAddContent(false);
                  setSelectedFile(null);
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
                {selectedFile ? selectedFile.name : "Upload a document"}
              </h3>

              <p className="mt-1 text-sm text-zinc-500">
                {selectedFile
                  ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB`
                  : "PDF files are supported"}
              </p>

              <label className="mt-5 inline-block cursor-pointer rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100">
                {selectedFile ? "Choose Another File" : "Choose File"}

                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;

                    if (file) {
                      setSelectedFile(file);
                    }
                  }}
                />
              </label>
            </div>

            {/* Actions */}
            <div className="mt-7 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddContent(false);
                  setSelectedFile(null);
                }}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
              >
                Cancel
              </button>

              <button
                disabled={!selectedFile}
                className={`rounded-xl px-5 py-2.5 text-sm font-medium transition ${
                  selectedFile
                    ? "bg-zinc-900 text-white hover:bg-zinc-800"
                    : "cursor-not-allowed bg-zinc-200 text-zinc-400"
                }`}
              >
                Add Content
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}