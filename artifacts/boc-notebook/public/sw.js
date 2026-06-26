/* Service worker for BOC Study Notebook daily reminders (Web Push). */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "BOC Study Notebook", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "BOC Study Notebook";
  const options = {
    body: payload.body || "Time for today's study.",
    tag: payload.tag || "boc-daily-reminder",
    renotify: true,
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Resolve the target against the service worker's scope so the click opens
  // the app's dashboard regardless of where it's mounted.
  const raw = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(raw, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        // Focus an already-open app tab if we have one.
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) {
              await client.navigate(target).catch(() => {});
            }
            return;
          } catch {
            // fall through to opening a new window
          }
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
