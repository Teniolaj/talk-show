import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type StoredActivity = {
  id: string;
  type: "documents-added" | "session-completed";
  title: string;
  createdAt: string;
};

const ACTIVITY_LIMIT = 50;

function isStoredActivity(value: unknown): value is StoredActivity {
  if (!value || typeof value !== "object") return false;

  const activity = value as Partial<StoredActivity>;
  return (
    typeof activity.id === "string" &&
    (activity.type === "documents-added" || activity.type === "session-completed") &&
    typeof activity.title === "string" &&
    typeof activity.createdAt === "string"
  );
}

export async function getStoredActivities(): Promise<StoredActivity[]> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const activities = session?.user.user_metadata?.recentActivity;
  return Array.isArray(activities) ? activities.filter(isStoredActivity) : [];
}

export async function recordActivity(
  activity: Omit<StoredActivity, "id" | "createdAt">
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return;

  const existingActivities = Array.isArray(session.user.user_metadata?.recentActivity)
    ? session.user.user_metadata.recentActivity.filter(isStoredActivity)
    : [];
  const nextActivity: StoredActivity = {
    ...activity,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const { error } = await supabase.auth.updateUser({
    data: {
      ...session.user.user_metadata,
      recentActivity: [nextActivity, ...existingActivities].slice(0, ACTIVITY_LIMIT),
    },
  });

  if (error) throw error;
}
