import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReminderPreferences,
  getGetReminderPreferencesQueryKey,
} from "@workspace/api-client-react";

// Imperative Web Push helpers. We keep the SW-registration + PushManager flow
// here (rather than the generated react-query mutations) because it's a
// multi-step imperative sequence; preference reads still use the generated hook
// so the UI stays in sync with the cache.

const SW_URL = `${import.meta.env.BASE_URL}sw.js`;
const SW_SCOPE = import.meta.env.BASE_URL;

function api(path: string): string {
  return `/api${path}`;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
}

async function fetchVapidKey(): Promise<string> {
  const res = await fetch(api("/reminders/vapid-public-key"), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Web Push is not configured on the server.");
  const json = (await res.json()) as { publicKey: string };
  return json.publicKey;
}

// Registers the SW, creates (or reuses) a push subscription, and saves it to
// the server scoped to this session. Throws on failure so the caller can show
// an error.
export async function enablePushSubscription(): Promise<void> {
  if (!isPushSupported()) throw new Error("unsupported");
  const reg = await getRegistration();
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await fetchVapidKey();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  const res = await fetch(api("/reminders/subscribe"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) throw new Error("Failed to save push subscription.");
}

export async function disablePushSubscription(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch(api("/reminders/unsubscribe"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function saveReminderPreferences(prefs: {
  enabled: boolean;
  time: string;
  timezone?: string;
  skippedDays?: number[];
}): Promise<{
  enabled: boolean;
  time: string;
  timezone: string;
  skippedDays: number[];
}> {
  const res = await fetch(api("/reminders/preferences"), {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("Failed to save reminder preferences.");
  return res.json();
}

export async function sendTestReminder(): Promise<number> {
  const res = await fetch(api("/reminders/test"), {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to send a test reminder.");
  const json = (await res.json()) as { sent: number };
  return json.sent;
}

export function usePushReminders() {
  const qc = useQueryClient();
  const { data: prefs, isLoading } = useGetReminderPreferences();
  const [busy, setBusy] = useState(false);

  // Make sure the service worker is registered as soon as a returning user
  // (with reminders already on) loads the app, so a fresh subscription is
  // re-saved if the browser rotated it.
  useEffect(() => {
    if (!isPushSupported()) return;
    void navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch(() => {});
  }, []);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: getGetReminderPreferencesQueryKey() });
  }, [qc]);

  return {
    supported: isPushSupported(),
    prefs: prefs ?? {
      enabled: false,
      time: "08:00",
      timezone: "America/Los_Angeles",
      skippedDays: [],
    },
    isLoading,
    busy,
    setBusy,
    invalidate,
  };
}
