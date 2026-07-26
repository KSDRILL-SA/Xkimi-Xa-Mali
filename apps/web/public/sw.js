// Offline support for the member app.
//
// NOTE: this worker is not registered anywhere yet — nothing in the app calls
// navigator.serviceWorker.register. It is kept because the rest of the PWA is
// in place (manifest, icons, the /offline page, a middleware allowance for this
// file), so it will be switched on at some point. The rules below are written
// for that day rather than for today.
//
// The rule that matters: NOTHING belonging to a signed-in member is cached.
//
// The previous version cached every same-origin GET that was not an /api/ call,
// which meant page HTML too. Three things followed from that, none of them
// obvious until the worker was actually running:
//
//   1. Authenticated pages — the dashboard, statements, member records — were
//      written to Cache Storage on disk, and nothing cleared them at logout. On
//      a shared device the network-first fallback would then serve the previous
//      member's dashboard the moment the connection dropped.
//   2. React Server Component payloads were cached under the page's URL. RSC
//      responses vary by request header, not by URL, so a cached payload can be
//      served in place of a document (or the reverse) and corrupt navigation.
//   3. Those payloads are streams, and `response.clone()` into `cache.put()`
//      tees a stream that React is still reading.
//
// So: static assets and the offline page are cached, because they are identical
// for everyone and reveal nothing. Everything else goes to the network, and a
// failed navigation falls back to the offline page rather than to a stale copy
// of whatever was last viewed.

// Bumping this name purges previously cached page HTML on activate. Any install
// carrying the old cache is cleaned up the first time this version runs.
const CACHE_NAME = 'xxm-v2'
const OFFLINE_URL = '/offline'

const STATIC_PATTERNS = [
  /^\/_next\/static\//,
  /^\/_next\/image\//,
  /^\/icons\//,
  /^\/manifest\.json/,
  /\.(?:woff2?|ttf|otf)$/,
]

async function cacheOfflinePage() {
  const cache = await caches.open(CACHE_NAME)
  await cache.add(OFFLINE_URL)
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheOfflinePage().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only same-origin GETs are ours to think about.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // React Server Component payloads: never intercepted. They are streams that
  // React is reading, they vary by header rather than by URL, and they carry
  // member data. Letting the browser handle them is both safer and correct.
  if (url.searchParams.has('_rsc') || request.headers.get('RSC') === '1') return

  // API calls are never cached and never intercepted.
  if (url.pathname.startsWith('/api/')) return

  // Cache-first for static assets — identical for every member, reveal nothing.
  if (STATIC_PATTERNS.some((p) => p.test(url.pathname))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          }
          return response
        })
      }),
    )
    return
  }

  // Everything else — pages. Network only, with the offline page as the fallback.
  // The response is deliberately NOT stored: a cached page is a member's data
  // sitting on disk, outliving their session.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then(
          (offline) =>
            offline ??
            new Response('You are offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            }),
        ),
      ),
    )
  }
})
