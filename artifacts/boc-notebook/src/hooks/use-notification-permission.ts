import { useCallback, useEffect, useSyncExternalStore } from "react";

const PROMPT_KEY = "boc:notif-prompt-seen";
const ENABLED_KEY = "boc:notif-enabled";

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export type NotifPermissionState = "unsupported" | "default" | "granted" | "denied";

function readPermission(): NotifPermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission as NotifPermissionState;
}

function readBool(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function hasStoredPref(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeBool(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // ignore
  }
  emit();
}

interface Snapshot {
  permission: NotifPermissionState;
  promptSeen: boolean;
  enabled: boolean;
}

let cachedSnapshot: Snapshot | null = null;
function getSnapshot(): Snapshot {
  const permission = readPermission();
  // If the browser already granted notifications and the user has no
  // explicit stored preference (e.g. they granted permission on a prior
  // visit, or cleared localStorage), default `enabled` to true so they
  // actually receive the notifications they previously opted in to.
  const enabled = hasStoredPref(ENABLED_KEY)
    ? readBool(ENABLED_KEY)
    : permission === "granted";
  const next: Snapshot = {
    permission,
    promptSeen: readBool(PROMPT_KEY),
    enabled,
  };
  if (
    cachedSnapshot &&
    cachedSnapshot.permission === next.permission &&
    cachedSnapshot.promptSeen === next.promptSeen &&
    cachedSnapshot.enabled === next.enabled
  ) {
    return cachedSnapshot;
  }
  cachedSnapshot = next;
  return next;
}
function getServerSnapshot(): Snapshot {
  return { permission: "unsupported", promptSeen: false, enabled: false };
}

export function useNotificationPermission() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === ENABLED_KEY || e.key === PROMPT_KEY) emit();
    };
    const onVisibility = () => emit();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  const request = useCallback(async () => {
    if (typeof Notification === "undefined") return "unsupported" as const;
    try {
      const result = await Notification.requestPermission();
      writeBool(ENABLED_KEY, result === "granted");
      writeBool(PROMPT_KEY, true);
      emit();
      return result;
    } catch {
      return "denied" as const;
    }
  }, []);

  const dismissPrompt = useCallback(() => {
    writeBool(PROMPT_KEY, true);
  }, []);

  const setUserEnabled = useCallback((value: boolean) => {
    writeBool(ENABLED_KEY, value);
  }, []);

  const shouldPrompt =
    snapshot.permission === "default" &&
    !snapshot.promptSeen &&
    typeof Notification !== "undefined";

  const canNotify = snapshot.permission === "granted" && snapshot.enabled;

  return {
    permission: snapshot.permission,
    enabled: snapshot.enabled,
    canNotify,
    shouldPrompt,
    request,
    dismissPrompt,
    setEnabled: setUserEnabled,
  };
}
