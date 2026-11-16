/*
 * Boot watchdog for the CDN-shell production build (wired in web.mjs).
 *
 * The production index.html is served by dongban.xyz but loads its JS/CSS
 * from the NoDepend CDN host (pose.xzrcloud.xyz), which origin-pulls the very
 * same dist. If that host dies — plan expiry (2026-12-11), quota exhaustion,
 * route failure — the entry module never executes and the app would sit on a
 * blank page forever; today's per-file CDN fallback cannot help because the
 * boot path itself is what failed. This inline classic script is the
 * insurance: web.mjs injects it into dist/index.html only, immediately after
 * <head>, ahead of the entry script and stylesheet. If the entry script or
 * the entry stylesheet errors out, or the app has not booted within
 * SHELL_WATCHDOG_TIMEOUT_MS, it navigates ONCE to the same URL with
 * ?shell=origin, which makes the Worker serve the origin-based shell variant
 * (dist/index-origin.html from the same build) instead. The one-shot
 * sessionStorage flag makes a loop impossible — and the fallback page
 * carries no watchdog at all.
 *
 * The timeout insures against a DEAD host, not a slow one. A refused or
 * DNS-dead host surfaces through the resource error event almost
 * immediately; the 15 s bound only covers a blackholing host (packets
 * silently dropped). A pessimistic cold load of the ~208 KB entry chunk at
 * ~20 KB/s takes ~10 s, so 15 s stays clear of honest slow loads — and if
 * it ever did fire on a merely slow CDN route, the user lands on the origin
 * shell, which is exactly the pre-CDN behaviour, never worse.
 *
 * "Booted" is signalled by client/src/main.tsx setting
 * window.__MOVEMATE_BOOTED__ once the entry module has executed and the
 * React root render has been kicked off.
 */
export const SHELL_WATCHDOG_TIMEOUT_MS = 15_000;

export const shellWatchdogScript = `(function () {
  var w = window;
  var FLAG = 'movemate-shell-fallback';
  function booted() { return !!w.__MOVEMATE_BOOTED__; }
  function fallback() {
    if (booted()) return;
    try {
      if (w.sessionStorage.getItem(FLAG)) return;
      w.sessionStorage.setItem(FLAG, '1');
    } catch (e) { return; }
    var url = new URL(w.location.href);
    url.searchParams.set('shell', 'origin');
    w.location.replace(url.toString());
  }
  w.addEventListener('error', function (event) {
    var t = event && event.target;
    if (!t || t === w) return;
    if (t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && t.rel === 'stylesheet')) fallback();
  }, true);
  w.setTimeout(function () { if (!booted()) fallback(); }, ${SHELL_WATCHDOG_TIMEOUT_MS});
})();`;

/**
 * Insert the watchdog into a built index.html, immediately after <head> so
 * its error listener is registered before the entry script/stylesheet tags
 * that follow it in the head. Fails loudly: shipping the CDN shell without
 * its watchdog would silently remove the fallback this build exists with.
 */
export function injectShellWatchdog(html) {
  const marker = '<head>';
  const at = html.indexOf(marker);
  if (at < 0) throw new Error('shell-watchdog: index.html has no <head> to inject into; refusing to ship the CDN shell without its fallback watchdog.');
  if (html.includes('movemate-shell-fallback')) throw new Error('shell-watchdog: watchdog already present in index.html; refusing to inject twice.');
  return html.slice(0, at + marker.length) + '\n    <script>' + shellWatchdogScript + '</script>' + html.slice(at + marker.length);
}
