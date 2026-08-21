import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const repoId = new URL(request.url).searchParams.get("repo_id");
  if (!repoId) {
    return NextResponse.json({ error: "repo_id is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("repo_documents")
    .select("id, file_name, status, created_at")
    .eq("repo_id", repoId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ documents: data ?? [] });
}
