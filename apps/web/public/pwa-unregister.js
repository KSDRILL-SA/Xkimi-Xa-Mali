// Development only: tear down any previously-installed service worker and its
// caches. A SW that caches Next.js dev chunks (cache-first on /_next/static)
// serves stale chunks after every recompile, which crashes pages right after
// they load. Unregistering here self-heals browsers that installed the prod SW.
(function () {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  }).catch(function () {});
  if (window.caches && caches.keys) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    }).catch(function () {});
  }
})();
