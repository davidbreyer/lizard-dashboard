export const RECENT_TOOLS_KEY = 'lizard-dashboard.recent-tools.v1';
export const TOOLS = [
  { id: 'compare-lizard', name: 'Compare Lizard', icon: '±', description: 'Compare JSON and XML side by side.' },
  { id: 'format-lizard', name: 'Format Lizard', icon: '{ }', description: 'Format JSON, XML, YAML, and CSS.' },
  { id: 'mock-lizard', name: 'Mock Lizard', icon: '~', description: 'Generate mock API data from JSON.' },
  { id: 'duplicate-lizard', name: 'Duplicate Lizard', icon: '=', description: 'Find repeated IDs and similar XML entries.' },
  { id: 'datetime-lizard', name: 'DateTime Lizard', icon: 'T+', description: 'Convert dates and times for .NET, SQL Server, and APIs.' },
  { id: 'delim-lizard', name: 'Delim Lizard', icon: ',', description: 'Build lists for SQL, CSV, JavaScript, and URLs.' }
];
const ids = TOOLS.map(tool => tool.id);
const defaultIds = ['compare-lizard', 'format-lizard', 'mock-lizard'];
const appOrigin = 'https://www.davidbreyer.com';

export function normalizeRecentTools(value) {
  return [...new Set(Array.isArray(value) ? value : [])].filter(id => ids.includes(id)).slice(0, ids.length);
}

export function validRecentTools(value) {
  return Array.isArray(value) && value.length <= ids.length && value.every(id => ids.includes(id)) &&
    new Set(value).size === value.length;
}

export function toolForUrl(value) {
  try {
    const url = new URL(value, appOrigin);
    if (url.origin !== appOrigin || url.username || url.password) return null;
    const pathname = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
    return TOOLS.find(tool => pathname === '/' + tool.id + '/') || null;
  } catch { return null; }
}

export function recordRecentTool(storage, id) {
  if (!ids.includes(id)) return false;
  const raw = storage.getItem(RECENT_TOOLS_KEY);
  let current;
  try { current = normalizeRecentTools(JSON.parse(raw)); } catch { current = []; }
  const next = [id, ...current.filter(previous => previous !== id)];
  const encoded = JSON.stringify(next);
  if (raw !== encoded) storage.setItem(RECENT_TOOLS_KEY, encoded);
  return true;
}

export function recentShortcuts(value) {
  const recent = normalizeRecentTools(value);
  return (recent.length ? recent.slice(0, 3) : defaultIds).map(id => TOOLS.find(tool => tool.id === id));
}

export function refreshRecentTools(message = '') {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('recent-tools');
  if (!container) return;
  let recent = [];
  try { recent = normalizeRecentTools(JSON.parse(localStorage.getItem(RECENT_TOOLS_KEY))); }
  catch { message = message || 'Recent tools are unavailable in this browser. You can still open any tool.'; }
  document.getElementById('tools-title').textContent = recent.length ? 'Recent tools' : 'Lizard Tools';
  document.getElementById('recent-tools-status').textContent = message || (recent.length
    ? 'Most recently opened first.' : 'Open a tool here or in the directory to build your recent list.');
  document.getElementById('recent-tools-clear').hidden = recent.length === 0;
  const shortcuts = recentShortcuts(recent);
  const signature = shortcuts.map(tool => tool.id).join(',');
  if (container.dataset.recentIds === signature) return;
  const focusedUrl = container.contains(document.activeElement) ? document.activeElement.closest('a')?.href : null;
  const links = shortcuts.map(tool => {
    const link = document.getElementById('recent-tool-template').content.firstElementChild.cloneNode(true);
    link.href = appOrigin + '/' + tool.id + '/';
    link.querySelector('.tool-icon').textContent = tool.icon;
    link.querySelector('strong').textContent = tool.name;
    link.querySelector('small').textContent = tool.description;
    return link;
  });
  container.replaceChildren(...links);
  container.dataset.recentIds = signature;
  if (focusedUrl) {
    (links.find(link => link.href === focusedUrl) || document.querySelector('.tools .tool-directory'))?.focus({ preventScroll: true });
  }
}

function initRecentTools() {
  function track(event) {
    if (event.defaultPrevented || (event.type === 'click' ? event.button !== 0 : event.button !== 1)) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a.tool');
    if (!link || !link.closest('.tool-links')) return;
    const tool = toolForUrl(link.href);
    if (!tool) return;
    let message = '';
    try { recordRecentTool(localStorage, tool.id); }
    catch { message = 'Recent tools could not be saved in this browser.'; }
    // Let native link activation finish before replacing the clicked shortcut.
    setTimeout(() => refreshRecentTools(message), 0);
  }
  document.addEventListener('click', track);
  document.addEventListener('auxclick', track);
  document.getElementById('recent-tools-clear')?.addEventListener('click', () => {
    try {
      localStorage.removeItem(RECENT_TOOLS_KEY);
      refreshRecentTools();
      document.querySelector('.tools .tool-directory')?.focus();
    } catch { document.getElementById('recent-tools-status').textContent = 'Recent tool history could not be cleared.'; }
  });
  window.addEventListener('storage', event => {
    if (event.key === RECENT_TOOLS_KEY || event.key === null) refreshRecentTools();
  });
  window.addEventListener('pageshow', () => refreshRecentTools());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshRecentTools();
  });
  refreshRecentTools();
}

if (typeof document !== 'undefined') initRecentTools();
