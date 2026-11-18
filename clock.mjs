export const CLOCK_COLOR_KEY = 'timeuntil.clock.color.v1';
export const CLOCK_COLORS = { ember: '#ff915d', violet: '#b5a3ff', tidal: '#79d8d0', gold: '#f4ce71' };

export function clockState(now = new Date()) {
  return {
    time: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    elapsed: now.getSeconds(),
    remaining: 60 - now.getSeconds(),
    dateTime: now.toISOString()
  };
}

export function initClockCard() {
  const card = document.getElementById('clock-card');
  const time = document.getElementById('clock-time');
  const detail = document.getElementById('clock-detail');
  const ring = document.getElementById('clock-dots');
  const selector = document.getElementById('clock-color');
  const status = document.getElementById('clock-color-status');
  const zone = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time').replaceAll('_', ' ');
  const dots = [];
  let timer;
  for (let index = 0; index < 60; index++) {
    const angle = index * Math.PI / 30 - Math.PI / 2;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', String(240 + 205 * Math.cos(angle)));
    dot.setAttribute('cy', String(240 + 205 * Math.sin(angle)));
    dot.setAttribute('r', '4');
    dot.classList.add('clock-second-dot');
    ring.append(dot);
    dots.push(dot);
  }
  function applyColor(value) {
    const choice = Object.hasOwn(CLOCK_COLORS, value) ? value : 'ember';
    selector.value = choice;
    card.style.setProperty('--clock-color', CLOCK_COLORS[choice]);
  }
  function restoreColor() {
    status.textContent = '';
    try { applyColor(localStorage.getItem(CLOCK_COLOR_KEY)); }
    catch {
      applyColor('ember');
      status.textContent = 'Saved color unavailable in this browser.';
    }
  }
  function refresh() {
    clearTimeout(timer);
    if (document.hidden || card.hidden) return;
    const now = new Date();
    const state = clockState(now);
    if (time.textContent !== state.time) time.textContent = state.time;
    time.dateTime = state.dateTime;
    time.setAttribute('aria-label', state.time + ' local time');
    dots.forEach((dot, index) => dot.classList.toggle('elapsed', index < state.elapsed));
    detail.textContent = state.time + ' in ' + zone + '. ' + state.remaining + ' seconds remaining in this minute.';
    timer = setTimeout(refresh, 1000 - now.getMilliseconds() + 5);
  }
  selector.addEventListener('change', () => {
    applyColor(selector.value);
    status.textContent = '';
    try { localStorage.setItem(CLOCK_COLOR_KEY, selector.value); }
    catch { status.textContent = 'Color changed for this visit, but could not be saved.'; }
  });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pageshow', () => { restoreColor(); refresh(); });
  window.addEventListener('pagehide', () => clearTimeout(timer));
  restoreColor();
  refresh();
  return { refresh, restoreColor };
}
