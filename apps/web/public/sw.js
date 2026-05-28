const CACHE_NAME = 'xxm-v2'
const OFFLINE_URL = '/offline'

const STATIC_PATTERNS = [
  /^\/_next\/static\//,
  /^\/_next\/image\//,
  /^\/icons\//,
  /^\/manifest\.webmanifest/,
  /\.(?:woff2?|ttf|otf)$/,
]

const NETWORK_ONLY_PATTERNS = [/^\/api\//]

async function cacheOfflinePage() {
  const cache = await caches.open(CACHE_NAME)
  try {
    await cache.add(OFFLINE_URL)
  } catch {
    // Non-fatal during install
  }
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

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  const path = url.pathname

  if (NETWORK_ONLY_PATTERNS.some((p) => p.test(path))) {
    event.respondWith(fetch(request))
    return
  }

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

  // HTML navigations: network-only — never serve stale/offline for server errors
  const isDocument = request.mode === 'navigate' || request.destination === 'document'

  if (isDocument) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request)
        if (cached) return cached
        const offline = await caches.match(OFFLINE_URL)
        if (offline) return offline
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      }),
    )
    return
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached ?? fetch(request))),
  )
})
