import { randomUUID } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type SupabaseServerClient = ReturnType<typeof getSupabaseServerClient>;

export const STORAGE_BUCKET = "repo-documents";

// Browsers don't always report a File's MIME type reliably (empty or generic
// application/octet-stream), which then becomes the Content-Type Supabase
// Storage serves the file with. Some downstream file-type validators (e.g.
// the n8n workflow's document extraction node) check that header, not just
// the URL's extension — so derive it from the extension ourselves rather
// than trusting file.type.
const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function resolveContentType(filename: string, fallback: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  return (ext && MIME_TYPES_BY_EXTENSION[ext]) || fallback || "application/octet-stream";
}

// Carries the generated document id even when the upload failed, so callers
// can still correlate the failure with a row (or attempted row) in the UI.
export class DocumentUploadError extends Error {
  documentId: string;

  constructor(documentId: string, message: string) {
    super(message);
    this.name = "DocumentUploadError";
    this.documentId = documentId;
  }
}

export type UploadedDocument = {
  documentId: string;
  fileUrl: string;
};

export async function uploadDocumentToStorage(
  supabase: SupabaseServerClient,
  repoId: string,
  file: File
): Promise<UploadedDocument> {
  const documentId = randomUUID();

  // repo_chunks.document_id has a foreign key into repo_documents, and the
  // n8n workflow only ever UPDATEs that row's status — it never creates it.
  const { error: docInsertError } = await supabase.from("repo_documents").insert({
    id: documentId,
    repo_id: repoId,
    file_name: file.name,
    status: "pending",
  });
  if (docInsertError) {
    throw new DocumentUploadError(documentId, docInsertError.message);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const storagePath = `${repoId}/${documentId}/${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType: resolveContentType(file.name, file.type),
        upsert: false,
      });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

    return { documentId, fileUrl: publicUrlData.publicUrl };
  } catch (err) {
    await supabase.from("repo_documents").update({ status: "error" }).eq("id", documentId);
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new DocumentUploadError(documentId, message);
  }
}

type N8nIngestResponse = {
  success?: boolean;
  document_id?: string;
  chunks_created?: number;
  message?: string;
};

export type IngestResult = {
  chunksCreated: number;
};

// The webhook's `responseNode` mode makes n8n hold the HTTP response open
// until the "Respond Success" node runs, which is the last step after the
// workflow has already flipped repo_documents.status to "ready" — so this
// resolving is itself the "ready" signal, not just "the workflow started".
export async function ingestDocument(
  supabase: SupabaseServerClient,
  webhookUrl: string,
  params: { repoId: string; documentId: string; fileUrl: string }
): Promise<IngestResult> {
  try {
    const webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: params.fileUrl,
        repo_id: params.repoId,
        document_id: params.documentId,
      }),
    });

    const rawBody = await webhookRes.text();
    let body: N8nIngestResponse | null = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      // n8n returned something that isn't JSON (e.g. an HTML error page) — fall through
      // and report the raw text below.
    }

    if (!webhookRes.ok || !body?.success) {
      const detail = body?.message ?? rawBody.slice(0, 300) ?? "";
      throw new Error(`Ingestion webhook failed (${webhookRes.status})${detail ? `: ${detail}` : ""}`);
    }

    return { chunksCreated: body.chunks_created ?? 0 };
  } catch (err) {
    await supabase.from("repo_documents").update({ status: "error" }).eq("id", params.documentId);
    throw err;
  }
}
