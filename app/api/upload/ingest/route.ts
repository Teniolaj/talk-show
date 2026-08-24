import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { ingestDocument } from "@/lib/document-ingestion";

export const runtime = "nodejs";

// Second phase of the per-file lifecycle used by the multi-file uploader:
// triggers the n8n webhook for a document that /api/upload/start already
// uploaded. The webhook's responseNode mode means this call doesn't resolve
// until the workflow has finished chunking/embedding and flipped the
// document's status to "ready" — so there's no need to poll afterward.
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

  const { documentId, fileUrl } = (await request.json()) as {
    documentId?: string;
    fileUrl?: string;
  };

  if (!documentId || !fileUrl) {
    return NextResponse.json({ error: "documentId and fileUrl are required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  try {
    const { chunksCreated } = await ingestDocument(supabase, webhookUrl, {
      repoId: user.id,
      documentId,
      fileUrl,
    });

    return NextResponse.json({ chunksCreated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
