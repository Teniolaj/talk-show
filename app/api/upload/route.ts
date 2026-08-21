import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STORAGE_BUCKET = "repo-documents";

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

type FileResult = {
  filename: string;
  documentId: string;
  chunkCount: number;
  error?: string;
};

type N8nIngestResponse = {
  success?: boolean;
  document_id?: string;
  chunks_created?: number;
  message?: string;
};

export async function POST(request: Request) {
  const webhookUrl = process.env.N8N_INGEST_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ error: "Missing N8N_INGEST_WEBHOOK_URL" }, { status: 500 });
  }

  const authClient = await getSupabaseServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const repoId = user.id;

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const results: FileResult[] = [];

  for (const file of files) {
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
      results.push({
        filename: file.name,
        documentId,
        chunkCount: 0,
        error: docInsertError.message,
      });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const storagePath = `${user.id}/${documentId}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: resolveContentType(file.name, file.type),
          upsert: false,
        });
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const webhookRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: publicUrlData.publicUrl,
          repo_id: repoId,
          document_id: documentId,
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
        throw new Error(
          `Ingestion webhook failed (${webhookRes.status})${detail ? `: ${detail}` : ""}`
        );
      }

      results.push({
        filename: file.name,
        documentId,
        chunkCount: body.chunks_created ?? 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await supabase.from("repo_documents").update({ status: "error" }).eq("id", documentId);
      results.push({ filename: file.name, documentId, chunkCount: 0, error: message });
    }
  }

  return NextResponse.json({ results });
}
