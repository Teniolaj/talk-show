import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type TalkShow = {
  id: string;
  name: string;
  description: string;
  category: string;
  createdAt: string;
  documentIds?: string[];
};

// Talk shows live in auth.users.user_metadata rather than a dedicated table —
// deliberate, not an oversight. Trade-offs, given that constraint:
// - user_metadata rides along in the session/JWT on every request (including
//   every proxy.ts token refresh), so it isn't meant for a growing dataset.
// - No server-side querying/filtering: getTalkShows() always pulls the whole
//   array and any list/search UI filters client-side.
// - updateUser() replaces the whole `data` object, so every write here is a
//   full read-modify-write of the array, not an atomic append — concurrent
//   edits across tabs/devices can race, and the last write wins.

export async function getTalkShows(): Promise<TalkShow[]> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return (session?.user.user_metadata?.talkShows as TalkShow[] | undefined) ?? [];
}

export async function getTalkShow(id: string): Promise<TalkShow | null> {
  const talkShows = await getTalkShows();
  return talkShows.find((show) => show.id === id) ?? null;
}

export async function addTalkShow(
  input: Pick<TalkShow, "name" | "description" | "category">
): Promise<TalkShow> {
  const newTalkShow: TalkShow = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description,
    category: input.category,
    createdAt: new Date().toISOString(),
  };

  const existingTalkShows = await getTalkShows();
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.updateUser({
    data: { talkShows: [...existingTalkShows, newTalkShow] },
  });
  if (error) throw error;

  return newTalkShow;
}
export async function updateTalkShowDocuments(
  id: string,
  documentIds: string[]
): Promise<TalkShow> {
  const existingTalkShows = await getTalkShows();
  const updatedTalkShows = existingTalkShows.map((show) =>
    show.id === id ? { ...show, documentIds } : show
  );
  const updatedTalkShow = updatedTalkShows.find((show) => show.id === id);

  if (!updatedTalkShow) throw new Error("Talk show not found");

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.updateUser({
    data: { talkShows: updatedTalkShows },
  });
  if (error) throw error;

  return updatedTalkShow;
}

export async function deleteTalkShow(id: string): Promise<void> {
  const existingTalkShows = await getTalkShows();
  const remainingTalkShows = existingTalkShows.filter((show) => show.id !== id);

  if (remainingTalkShows.length === existingTalkShows.length) {
    throw new Error("Talk show not found");
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.updateUser({
    data: { talkShows: remainingTalkShows },
  });
  if (error) throw error;
}
