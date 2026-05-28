const CACHE_NAME = 'xxm-v1'
const OFFLINE_URL = '/offline'

const STATIC_PATTERNS = [
  /^\/_next\/static\//,
  /^\/_next\/image\//,
  /^\/icons\//,
  /^\/manifest\.json/,
  /\.(?:woff2?|ttf|otf)$/,
]

const NETWORK_ONLY_PATTERNS = [
  /^\/api\//,
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

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  const path = url.pathname

  // Network-only — never cache API calls
  if (NETWORK_ONLY_PATTERNS.some((p) => p.test(path))) {
    event.respondWith(fetch(request))
    return
  }

  // Cache-first — static assets
  if (STATIC_PATTERNS.some((p) => p.test(path))) {
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

  // Network-first — pages: try network, fall back to offline page on failure
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        }
        return response
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached ?? caches.match(OFFLINE_URL),
        ),
      ),
  )
})
