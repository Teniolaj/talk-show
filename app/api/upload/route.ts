import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { DocumentUploadError, ingestDocument, uploadDocumentToStorage } from "@/lib/document-ingestion";

export const runtime = "nodejs";

type FileResult = {
  filename: string;
  documentId: string;
  chunkCount: number;
  error?: string;
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
    let documentId = "";

    try {
      const uploaded = await uploadDocumentToStorage(supabase, repoId, file);
      documentId = uploaded.documentId;

      const { chunksCreated } = await ingestDocument(supabase, webhookUrl, {
        repoId,
        documentId,
        fileUrl: uploaded.fileUrl,
      });

      results.push({ filename: file.name, documentId, chunkCount: chunksCreated });
    } catch (err) {
      if (!documentId && err instanceof DocumentUploadError) {
        documentId = err.documentId;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ filename: file.name, documentId, chunkCount: 0, error: message });
    }
  }

  return NextResponse.json({ results });
}
