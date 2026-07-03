import { Badge } from "@/components/ui/badge";

// Session duration: for active sessions, time since sign-in; for ended ones,
// sign-in through the last observed heartbeat. The heartbeat is only recorded
// when the app mounts, so this is an approximate "observed activity window",
// not an exact signed-in duration.
export function sessionDuration(s: {
  startedAt: string;
  lastSeenAt: string;
  active: boolean | null;
}): string {
  const start = new Date(s.startedAt).getTime();
  const end = s.active ? Date.now() : new Date(s.lastSeenAt).getTime();
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export const SESSION_DURATION_HINT =
  "Approximate: measured from sign-in to the last recorded app activity (or now, if still logged in).";

// Live sign-in status straight from Clerk (the auth provider), so it reflects
// real logouts/expiry even though the app itself never records a logout event.
export function SessionStatusBadge({ active }: { active: boolean | null }) {
  if (active === true) {
    return (
      <Badge
        className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
        title="This session is still signed in (live status from the auth provider)."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Logged in
      </Badge>
    );
  }
  if (active === false) {
    return (
      <Badge
        variant="secondary"
        title="This session has been signed out or has expired."
      >
        Logged out
      </Badge>
    );
  }
  return (
    <Badge variant="outline" title="Live session status could not be retrieved.">
      Unknown
    </Badge>
  );
}
