// Session-only: this controls the dashboard page, independently of its cards.
export function initKeepAwake({
  page = globalThis.window,
  doc = globalThis.document,
  browser = globalThis.navigator,
  toggle = doc.getElementById('dashboard-keep-awake'),
  status = doc.getElementById('dashboard-awake-status')
} = {}) {
  toggle.checked = false;
  if (!page.isSecureContext || typeof browser.wakeLock?.request !== 'function') {
    toggle.disabled = true;
    status.textContent = !page.isSecureContext ? 'Requires a secure connection.' : 'Not supported in this browser.';
    return;
  }
  let wanted = false, sentinel = null, pending = false, pageActive = true, generation = 0;
  function inactiveStatus() {
    status.textContent = !wanted ? 'Off' : doc.hidden || !pageActive ? 'Paused' : 'Paused — toggle off and on to retry.';
  }
  function releaseCurrent() {
    const previous = sentinel;
    sentinel = null;
    if (previous && !previous.released) void previous.release().catch(() => {});
  }
  async function acquire() {
    if (!wanted || !pageActive || doc.hidden || pending || (sentinel && !sentinel.released)) return;
    const requestGeneration = generation;
    pending = true;
    status.textContent = 'Starting…';
    try {
      const lock = await browser.wakeLock.request('screen');
      if (requestGeneration !== generation || !wanted || !pageActive || doc.hidden || lock.released) {
        if (!lock.released) await lock.release();
        if (requestGeneration === generation) inactiveStatus();
        return;
      }
      sentinel = lock;
      lock.addEventListener('release', () => {
        if (sentinel !== lock) return;
        sentinel = null;
        inactiveStatus();
      });
      status.textContent = 'Active';
    } catch {
      if (requestGeneration === generation && wanted && pageActive && !doc.hidden) {
        wanted = false;
        toggle.checked = false;
        status.textContent = 'Unavailable — try again.';
      }
    } finally {
      pending = false;
      // Complete a newer user choice after an older pending request was cancelled.
      if (requestGeneration !== generation && wanted && pageActive && !doc.hidden && !sentinel) void acquire();
    }
  }
  toggle.addEventListener('change', () => {
    wanted = toggle.checked;
    generation++;
    if (wanted) void acquire();
    else { releaseCurrent(); inactiveStatus(); }
  });
  doc.addEventListener('visibilitychange', () => {
    generation++;
    if (doc.hidden) { releaseCurrent(); inactiveStatus(); }
    else if (wanted) void acquire();
  });
  page.addEventListener('pagehide', () => {
    pageActive = false;
    generation++;
    releaseCurrent();
    inactiveStatus();
  });
  page.addEventListener('pageshow', () => {
    pageActive = true;
    generation++;
    if (wanted) void acquire();
  });
  page.addEventListener('focus', () => { if (wanted) void acquire(); });
  status.textContent = 'Off';
}
