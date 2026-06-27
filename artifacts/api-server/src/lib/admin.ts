import { clerkClient } from "@clerk/express";

const DEFAULT_ADMIN = "mhuddleston@heydividend.com";

/**
 * Emails that are granted admin access, configured via the `ADMIN_EMAILS`
 * environment variable (comma-separated, case-insensitive). Defaults to the
 * single program owner when unset so the dashboard is never locked out.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? DEFAULT_ADMIN)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

/** Resolve a Clerk user's primary email address (null if it can't be read). */
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const u = await clerkClient.users.getUser(userId);
    const primary =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ??
      u.emailAddresses[0];
    return primary?.emailAddress ?? null;
  } catch {
    return null;
  }
}

export async function isAdminUser(userId: string): Promise<boolean> {
  return isAdminEmail(await getUserEmail(userId));
}
