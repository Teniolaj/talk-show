import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Matches the fixed repo_id /api/match reads from — see that file's comment.
const REPO_ID = "00000000-0000-0000-0000-000000000001";

const STORAGE_BUCKET = "repo-documents";

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

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);

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
      repo_id: REPO_ID,
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
      const storagePath = `${documentId}/${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
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
          repo_id: REPO_ID,
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
