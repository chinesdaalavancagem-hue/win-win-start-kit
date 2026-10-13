self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "" }; }
  const title = payload.title || "Win or Win";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/logo.png",
    badge: payload.badge || "/favicon.png",
    data: { url: payload.data?.url || payload.url || "/plataforma" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data?.url || "/plataforma";
  const url = new URL(requestedUrl, self.location.origin);
  const safeUrl = url.origin === self.location.origin ? url.href : new URL("/plataforma", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ("navigate" in client && new URL(client.url).pathname !== new URL(safeUrl).pathname) {
          return client.navigate(safeUrl);
        }
        return;
      }
    }
    await self.clients.openWindow(safeUrl);
  })());
});
