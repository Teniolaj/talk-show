// full_name is only populated for OAuth providers (e.g. Google) — email+password
// signups never collect a name, so this falls back to the email's local part.
export function getInitials(fullName: string | null, email: string | null): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    const initials = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
    return initials.toUpperCase();
  }

  if (email) {
    const local = email.split("@")[0];
    return local.slice(0, 2).toUpperCase();
  }

  return "?";
}
