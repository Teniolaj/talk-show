import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSupabaseServerAuthClient } from "@/lib/supabase/server";

export async function GET() {
  const authClient = await getSupabaseServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("repo_documents")
    .select("id, file_name, status, created_at")
    .eq("repo_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}

export async function DELETE(request: Request) {
  try {
  const { documentId, documentIds } = (await request.json()) as {
    documentId?: string;
    documentIds?: string[];
  };
  const idsToDelete = [...new Set(documentIds ?? (documentId ? [documentId] : []))];
  if (idsToDelete.length === 0) {
    return NextResponse.json({ error: "At least one documentId is required" }, { status: 400 });
  }

  const authClient = await getSupabaseServerAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { data: documents, error: documentError } = await supabase
    .from("repo_documents")
    .select("id, file_name")
    .eq("repo_id", user.id)
    .in("id", idsToDelete);

  if (documentError) {
    return NextResponse.json({ error: documentError.message }, { status: 500 });
  }
  if (!documents || documents.length !== idsToDelete.length) {
    return NextResponse.json({ error: "One or more documents were not found" }, { status: 404 });
  }

  const { error: chunksError } = await supabase
    .from("repo_chunks")
    .delete()
    .eq("repo_id", user.id)
    .in("document_id", idsToDelete);
  if (chunksError) {
    return NextResponse.json({ error: chunksError.message }, { status: 500 });
  }

  const { error: documentDeleteError } = await supabase
    .from("repo_documents")
    .delete()
    .eq("repo_id", user.id)
    .in("id", idsToDelete);
  if (documentDeleteError) {
    return NextResponse.json({ error: documentDeleteError.message }, { status: 500 });
  }

  // Documents uploaded before per-user libraries used the shorter legacy path.
  // Removing both is safe: Supabase ignores paths that no longer exist.
  const storagePaths = documents.flatMap((document) => [
    `${user.id}/${document.id}/${document.file_name}`,
    `${document.id}/${document.file_name}`,
  ]);
  const talkShows = (user.user_metadata?.talkShows ?? []) as Array<{
    id: string;
    documentIds?: string[];
  }>;
  const updatedTalkShows = talkShows.map((show) => ({
    ...show,
    documentIds: (show.documentIds ?? []).filter((id) => !idsToDelete.includes(id)),
  }));
  const [storageResult, metadataResult] = await Promise.all([
    supabase.storage.from("repo-documents").remove(storagePaths),
    supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, talkShows: updatedTalkShows },
    }),
  ]);
  if (storageResult.error) {
    console.error("Deleted document record but could not remove storage file", storageResult.error);
  }
  const { error: metadataError } = metadataResult;
  if (metadataError) {
    console.error("Document deleted but could not update talk show selections", metadataError);
  }

  return NextResponse.json({ deleted: true, deletedIds: idsToDelete });
  } catch (error) {
    console.error("Document deletion failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Document deletion failed unexpectedly",
      },
      { status: 500 }
    );
  }
}
