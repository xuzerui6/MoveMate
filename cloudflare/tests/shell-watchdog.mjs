import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SHELL_WATCHDOG_TIMEOUT_MS, injectShellWatchdog, shellWatchdogScript } from '../scripts/shell-watchdog.mjs';

// Behavioural tests for the CDN-shell boot watchdog (scripts/shell-watchdog.mjs).
// The watchdog is an inline classic script with no imports, so it is executed
// verbatim in a vm context against a fake window: the tests drive its error
// listener and its boot timer exactly as a browser would, and observe the
// only effect that matters — location.replace navigations.
export async function shellWatchdogTests(t) {
  const makePage = ({ preFlagged = false, storageThrows = false } = {}) => {
    const store = new Map(preFlagged ? [['movemate-shell-fallback', '1']] : []);
    const timers = [];
    const listeners = [];
    const navigations = [];
    const fakeWindow = {
      __MOVEMATE_BOOTED__: false,
      sessionStorage: {
        getItem: key => { if (storageThrows) throw new Error('denied'); return store.has(key) ? store.get(key) : null; },
        setItem: (key, value) => { if (storageThrows) throw new Error('denied'); store.set(key, String(value)); },
      },
      location: {
        href: 'https://dongban.xyz/games/123?x=1',
        replace: url => navigations.push(url),
      },
      addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    };
    const sandbox = { window: fakeWindow, URL };
    vm.createContext(sandbox);
    vm.runInContext(shellWatchdogScript, sandbox);
    return {
      fakeWindow, timers, navigations,
      fireError(target) { for (const l of listeners) if (l.type === 'error') l.fn({ target }); },
      runTimers() { for (const timer of timers.splice(0)) timer.fn(); },
    };
  };

  await t.test('shell watchdog: entry script failure before boot navigates once to ?shell=origin', () => {
    const page = makePage();
    page.fireError({ tagName: 'SCRIPT' });
    assert.deepEqual(page.navigations, ['https://dongban.xyz/games/123?x=1&shell=origin']);
  });

  await t.test('shell watchdog: entry stylesheet failure triggers it; icon/manifest link failures do not', () => {
    const css = makePage();
    css.fireError({ tagName: 'LINK', rel: 'stylesheet' });
    assert.equal(css.navigations.length, 1);
    const icon = makePage();
    icon.fireError({ tagName: 'LINK', rel: 'icon' });
    icon.fireError({ tagName: 'LINK', rel: 'manifest' });
    assert.equal(icon.navigations.length, 0);
  });

  await t.test('shell watchdog: a booted app stands it down (no navigation on error or timeout)', () => {
    const page = makePage();
    page.fakeWindow.__MOVEMATE_BOOTED__ = true;
    page.fireError({ tagName: 'SCRIPT' });
    page.runTimers();
    assert.equal(page.navigations.length, 0);
  });

  await t.test('shell watchdog: the boot timer uses the pinned timeout and fires only when the app never booted', () => {
    const page = makePage();
    assert.equal(page.timers.length, 1);
    assert.equal(page.timers[0].ms, SHELL_WATCHDOG_TIMEOUT_MS);
    page.runTimers();
    assert.equal(page.navigations.length, 1);
  });

  await t.test('shell watchdog: it can never loop — the one-shot flag blocks repeat and pre-flagged navigations', () => {
    const page = makePage();
    page.fireError({ tagName: 'SCRIPT' });
    page.fireError({ tagName: 'SCRIPT' });
    page.runTimers();
    assert.equal(page.navigations.length, 1);
    const preFlagged = makePage({ preFlagged: true });
    preFlagged.fireError({ tagName: 'SCRIPT' });
    preFlagged.runTimers();
    assert.equal(preFlagged.navigations.length, 0);
  });

  await t.test('shell watchdog: window-level errors and storage-denied environments never navigate', () => {
    const page = makePage();
    page.fireError(page.fakeWindow);
    page.fireError(null);
    assert.equal(page.navigations.length, 0);
    const denied = makePage({ storageThrows: true });
    denied.fireError({ tagName: 'SCRIPT' });
    denied.runTimers();
    assert.equal(denied.navigations.length, 0);
  });

  await t.test('shell watchdog: injection lands right after <head>, verbatim, and refuses a headless or double injection', () => {
    const html = '<!DOCTYPE html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n    <script type="module" crossorigin src="https://pose.xzrcloud.xyz/assets/index-x.js"></script>\n  </head>\n</html>';
    const out = injectShellWatchdog(html);
    const headAt = out.indexOf('<head>');
    const scriptAt = out.indexOf('<script>' + shellWatchdogScript + '</script>');
    assert.ok(scriptAt > headAt && scriptAt < out.indexOf('type="module"'), 'watchdog must sit between <head> and the entry script');
    assert.ok(out.includes(String(SHELL_WATCHDOG_TIMEOUT_MS)), 'the pinned timeout is baked into the injected script');
    assert.throws(() => injectShellWatchdog('<html><body></body></html>'), /no <head>/);
    assert.throws(() => injectShellWatchdog(out), /already present/);
  });
}
