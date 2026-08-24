import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { DocumentUploadError, uploadDocumentToStorage } from "@/lib/document-ingestion";

export const runtime = "nodejs";

// First phase of the per-file lifecycle used by the multi-file uploader:
// storage upload + repo_documents row only. Kept separate from ingestion so
// the client can flip a file's status from "uploading" to "processing" the
// moment this resolves, instead of only learning about state once the whole
// (much slower) webhook call finishes.
export async function POST(request: Request) {
  const authClient = await getSupabaseServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  try {
    const { documentId, fileUrl } = await uploadDocumentToStorage(supabase, user.id, file);
    return NextResponse.json({ documentId, fileUrl });
  } catch (err) {
    const documentId = err instanceof DocumentUploadError ? err.documentId : null;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message, documentId }, { status: 500 });
  }
}
