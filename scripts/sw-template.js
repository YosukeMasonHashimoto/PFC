/* Generated per build. Only public application code is cached; user records remain in IndexedDB. */
const BUILD = "__PFC_PRECACHE__";
const CACHE = `pfc-shell-${BUILD.version}`;
const PAGES = new Set(BUILD.pages);
const ASSETS = new Set(BUILD.urls.filter((path) => !PAGES.has(path)));
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Install is atomic from the user's perspective: a failed precache never replaces the active worker.
      await cache.addAll(
        BUILD.urls.map((url) => new Request(url, { cache: "reload" })),
      );
    })(),
  );
  // Updates wait for explicit user acceptance; do not reload an in-progress form.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              (name.startsWith("pfc-shell-") ||
                name.startsWith("pfc-static-")) &&
              name !== CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "PFC_ACTIVATE") self.skipWaiting();
  if (event.data?.type === "PFC_STATUS")
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        const ready = (
          await Promise.all(
            BUILD.urls.map((url) => cache.match(url, { ignoreVary: true })),
          )
        ).every(Boolean);
        event.ports[0]?.postMessage({ ready, version: BUILD.version });
      })(),
    );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never store APIs, auth callbacks, RSC payloads, tokens or arbitrary requests.
  if (
    request.headers.get("RSC") === "1" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  )
    return;
  if (ASSETS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE),
          cached = await cache.match(url.pathname, { ignoreVary: true });
        return cached || fetch(request);
      })(),
    );
    return;
  }
  if (request.mode === "navigate")
    event.respondWith(
      (async () => {
        if (url.pathname === "/login")
          return Response.redirect(new URL("/", url.origin), 302);
        const cache = await caches.open(CACHE);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        try {
          const response = await fetch(request, { signal: controller.signal });
          if (response.ok || !PAGES.has(url.pathname)) return response;
        } catch {
          /* Fall back to the fully installed version. */
        } finally {
          clearTimeout(timer);
        }
        // Do not overwrite installed HTML with a newer deployment whose chunks aren't cached yet.
        return (
          (PAGES.has(url.pathname) &&
            (await cache.match(url.pathname, { ignoreVary: true }))) ||
          (await cache.match("/offline.html", { ignoreVary: true })) ||
          Response.error()
        );
      })(),
    );
});
