import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";
import { ingestDocument } from "@/lib/document-ingestion";
import { embedText } from "@/lib/gemini-embed";
import { extractPowerPointSlides } from "@/lib/pptx-slides";

export const runtime = "nodejs";

async function ingestPowerPoint(
  documentId: string,
  fileUrl: string,
  repoId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
) {
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) throw new Error("Could not download the uploaded PowerPoint.");
  const slides = extractPowerPointSlides(Buffer.from(await fileResponse.arrayBuffer()));

  const { error: deleteError } = await supabase
    .from("repo_chunks")
    .delete()
    .eq("repo_id", repoId)
    .eq("document_id", documentId);
  if (deleteError) throw new Error(deleteError.message);

  const chunks = [];
  for (const slide of slides) {
    const content = slide.content.trim();
    chunks.push({
      repo_id: repoId,
      document_id: documentId,
      heading: slide.heading,
      content,
      topic_tags: [],
      embedding: await embedText(`${slide.heading}\n${content}`),
    });
  }

  const { error: insertError } = await supabase.from("repo_chunks").insert(chunks);
  if (insertError) throw new Error(insertError.message);

  const { error: statusError } = await supabase
    .from("repo_documents")
    .update({ status: "ready" })
    .eq("repo_id", repoId)
    .eq("id", documentId);
  if (statusError) throw new Error(statusError.message);
  return { chunksCreated: slides.length };
}

// Second phase of the per-file lifecycle used by the multi-file uploader:
// triggers the n8n webhook for a document that /api/upload/start already
// uploaded. The webhook's responseNode mode means this call doesn't resolve
// until the workflow has finished chunking/embedding and flipped the
// document's status to "ready" — so there's no need to poll afterward.
export async function POST(request: Request) {
  const webhookUrl = process.env.N8N_INGEST_WEBHOOK_URL;

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
    const { data: document, error: documentError } = await supabase
      .from("repo_documents")
      .select("file_name")
      .eq("repo_id", user.id)
      .eq("id", documentId)
      .single();
    if (documentError || !document) throw new Error("The uploaded document could not be found.");

    const isPowerPoint = document.file_name.toLowerCase().endsWith(".pptx");
    if (!isPowerPoint && !webhookUrl) {
      throw new Error("Missing N8N_INGEST_WEBHOOK_URL");
    }
    const result = isPowerPoint
      ? await ingestPowerPoint(documentId, fileUrl, user.id, supabase)
      : await ingestDocument(supabase, webhookUrl!, { repoId: user.id, documentId, fileUrl });

    return NextResponse.json(result);
  } catch (err) {
    await supabase.from("repo_documents").update({ status: "error" }).eq("repo_id", user.id).eq("id", documentId);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
