(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const COLOR = '#D4AF37';
  const bar = document.createElement('div');
  bar.setAttribute('aria-hidden', 'true');
  bar.style.cssText =
    'position:fixed;top:0;left:0;height:3px;width:0;background:' +
    COLOR +
    ';box-shadow:0 0 8px ' + COLOR + ',0 0 4px ' + COLOR +
    ';z-index:99999;pointer-events:none;opacity:0;' +
    'transition:width 200ms ease,opacity 300ms ease';
  document.body.appendChild(bar);

  let trickle = null;
  let finish = null;
  let reset = null;
  let safetyTimer = null;
  let progress = 0;
  let fading = false;

  function clearTimers() {
    if (trickle) { clearInterval(trickle); trickle = null; }
    if (finish)  { clearTimeout(finish);   finish  = null; }
    if (reset)   { clearTimeout(reset);    reset   = null; }
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
  }

  function render() {
    bar.style.width   = progress + '%';
    bar.style.opacity = fading || progress === 0 ? '0' : '1';
  }

  function done() {
    clearTimers();
    progress = 100;
    render();
    finish = setTimeout(function () {
      fading = true;
      render();
      reset = setTimeout(function () {
        progress = 0;
        fading   = false;
        render();
      }, 300);
    }, 150);
  }

  function start() {
    clearTimers();
    fading   = false;
    progress = 8;
    render();
    trickle = setInterval(function () {
      if (progress === 0 || progress >= 90) return;
      progress = progress + (90 - progress) * 0.1;
      render();
    }, 200);
    // Safety: auto-complete after 10 s so the bar never gets permanently stuck
    safetyTimer = setTimeout(done, 10000);
  }

  // Expose API so the React NavigationProgress component can signal completion
  window.navProgress = { start: start, done: done };

  // Start on same-origin link clicks
  document.addEventListener('click', function (e) {
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href       = anchor.getAttribute('href');
    const linkTarget = anchor.getAttribute('target');
    if (!href || href.charAt(0) === '#' || (linkTarget && linkTarget !== '_self')) return;
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
    } catch (_) { return; }
    start();
  }, true);

  // Start on browser back/forward — done() will fire via the React component
  window.addEventListener('popstate', start);

  // Start on Next.js router pushState/replaceState — do NOT call done() here;
  // the React NavigationProgress component calls done() once the new page renders.
  ['pushState', 'replaceState'].forEach(function (method) {
    const original = history[method];
    history[method] = function () {
      const result = original.apply(this, arguments);
      start();
      return result;
    };
  });

  window.addEventListener('beforeunload', clearTimers);
})();
