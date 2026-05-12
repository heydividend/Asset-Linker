import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListStudyGroupSessions,
  getListStudyGroupSessionsQueryKey,
  type StudyGroupSession,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useNotificationPermission } from "@/hooks/use-notification-permission";

const STORAGE_KEY = "boc:study-group-timeout-seen";
const POLL_INTERVAL_MS = 30_000;

type SeenMap = Record<string, string>;

function readSeen(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: SeenMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeSeen(map: SeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / privacy errors
  }
}

interface TimedOut {
  session: StudyGroupSession;
  timedOutAt: string;
  round: number;
}

function pickTimedOut(sessions: StudyGroupSession[]): TimedOut[] {
  const out: TimedOut[] = [];
  for (const s of sessions) {
    const at = (s as { timedOutAt?: string | null }).timedOutAt;
    const round = (s as { timedOutRound?: number | null }).timedOutRound;
    if (typeof at === "string" && typeof round === "number") {
      out.push({ session: s, timedOutAt: at, round });
    }
  }
  return out;
}

/**
 * Global notifier that watches the study-group sessions list and toasts when
 * the server's stale-stream sweeper flips a round to timed_out. The toast
 * exposes a "Resume" action that deep-links the user back into the round
 * with the resume affordance focused. We dedupe by (sessionId → timedOutAt)
 * in localStorage so the same timeout doesn't re-toast on every poll/refresh.
 *
 * Mounted once at the app root so the alert reaches the user wherever they
 * happen to be — dashboard, notebooks, quiz, etc.
 */
function buildDeepLink(sessionId: string | number, round: number): string {
  const path = `/study-group?session=${sessionId}&round=${round}`;
  if (typeof window === "undefined") return path;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${window.location.origin}${base}${path}`;
}

function fireSystemNotification(opts: {
  sessionId: string | number;
  round: number;
  title: string;
  url: string;
  navigate: (to: string) => void;
}) {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification("Study group round timed out", {
      body: `Round ${opts.round} of "${opts.title}" stalled while you were away — pick up where the group left off.`,
      tag: `sg-timeout-${opts.sessionId}-${opts.round}`,
      data: { url: opts.url },
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore
      }
      const path = `/study-group?session=${opts.sessionId}&round=${opts.round}`;
      opts.navigate(path);
      n.close();
    };
  } catch {
    // ignore browsers that block constructor (e.g. require ServiceWorker)
  }
}

export function useStudyGroupTimeoutNotifier() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const { canNotify } = useNotificationPermission();
  const seenRef = useRef<SeenMap>(readSeen());
  const initializedRef = useRef(false);

  const { data: sessions = [] } = useListStudyGroupSessions(undefined, {
    query: {
      queryKey: getListStudyGroupSessionsQueryKey(),
      refetchInterval: POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });

  useEffect(() => {
    const stuck = pickTimedOut(sessions);

    // First poll after mount: silently mark whatever is already timed out as
    // "seen" so we don't fire a stale toast for a round that timed out hours
    // ago and the user has already noticed (or dismissed).
    if (!initializedRef.current) {
      initializedRef.current = true;
      const next = { ...seenRef.current };
      let changed = false;
      for (const s of stuck) {
        const key = String(s.session.id);
        if (next[key] !== s.timedOutAt) {
          next[key] = s.timedOutAt;
          changed = true;
        }
      }
      if (changed) {
        seenRef.current = next;
        writeSeen(next);
      }
      return;
    }

    const next = { ...seenRef.current };
    let changed = false;
    for (const s of stuck) {
      const key = String(s.session.id);
      if (next[key] === s.timedOutAt) continue;

      // Skip toast if the user is already looking at this exact session on
      // the Study Group page — they'll see the in-page banner there.
      const onThisSession =
        location.startsWith("/study-group") &&
        new URLSearchParams(location.split("?")[1] ?? "").get("session") ===
          String(s.session.id);

      const targetUrl = `/study-group?session=${s.session.id}&round=${s.round}`;
      const tabHidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";

      // System notification: fire whenever the tab is hidden, regardless of
      // which page the user was on, so they get a real OS push.
      if (canNotify && tabHidden) {
        fireSystemNotification({
          sessionId: s.session.id,
          round: s.round,
          title: s.session.title,
          url: buildDeepLink(s.session.id, s.round),
          navigate,
        });
      }

      if (!onThisSession) {
        toast({
          title: "Study group round timed out",
          description: `Round ${s.round} of "${s.session.title}" stalled while you were away — pick up where the group left off.`,
          action: (
            <ToastAction
              altText="Resume study group round"
              onClick={() => navigate(targetUrl)}
              data-testid={`toast-action-resume-sg-${s.session.id}`}
            >
              Resume
            </ToastAction>
          ),
        });
      }

      next[key] = s.timedOutAt;
      changed = true;
    }
    if (changed) {
      seenRef.current = next;
      writeSeen(next);
    }
  }, [sessions, toast, navigate, location, canNotify]);
}

export function StudyGroupTimeoutNotifier() {
  useStudyGroupTimeoutNotifier();
  return null;
}
