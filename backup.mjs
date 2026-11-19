import { RECENT_TOOLS_KEY, validRecentTools } from './recent-tools.mjs?v=development';
import { LUFTBLASEN_KEY, validLuftblasenProgress } from './luftblasen.mjs?v=development';

// Storage contracts audited against the Lizard apps in November 2026.
// Values stay as their original strings so a backup preserves every saved field.
export const CARD_IDS = ['weather-card', 'countdown-card', 'todo-card', 'quiz-card', 'upcoming-card', 'clock-card', 'luftblasen-card'];
export const OPTIONAL_CARD_IDS = ['luftblasen-card'];
export const OPTIONAL_CARDS_KEY = 'lizard-dashboard.optional-cards.v1';
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const BACKUP_APPS = [
  { id: 'dashboard', name: 'Dashboard', keys: ['lizard-dashboard.hidden-cards.v1', 'lizard-dashboard.card-order.v1', RECENT_TOOLS_KEY, OPTIONAL_CARDS_KEY], detail: 'Card choices, order and recent tools' },
  { id: 'luftblasen', name: 'Luftblasen', keys: [LUFTBLASEN_KEY], detail: 'High scores and game preferences' },
  { id: 'todo', name: 'To Do Lizard', keys: ['todo-lizard:v1', 'todo-lizard:settings:v1'], detail: 'Tasks and list preferences' },
  { id: 'timeuntil', name: 'Time Until', keys: ['timeuntil.events.v1', 'timeuntil.clock.color.v1'], detail: 'Countdowns and clock color' },
  { id: 'quiz', name: 'Quiz Your Lizard', keys: ['quiz-your-lizard:v1'], detail: 'Quiz library, settings and practice history' },
  { id: 'weather', name: 'Weather Lizard', keys: ['weather-lizard.location.v1'], detail: 'Saved location' },
  { id: 'format', name: 'Format Lizard', keys: ['format-lizard.workspace.v1'], detail: 'Input, output and settings' },
  { id: 'format-v2', name: 'Format Lizard v2', keys: ['format-lizard.workspace.v2'], detail: 'Saved input, output and settings' },
  { id: 'compare', name: 'Compare Lizard', keys: ['compare-lizard.workspace.v1'], detail: 'Both inputs, comparison and settings' },
  { id: 'delim', name: 'Delim Lizard', keys: ['delim-lizard.workspace.v1'], detail: 'Input and settings' }
];
const themes = ['ember', 'violet', 'tidal', 'gold'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const dateTime = value => text(value) && Number.isFinite(Date.parse(value));
const optional = (value, predicate) => value === undefined || predicate(value);
const choices = values => value => values.includes(value);
const unique = values => new Set(values).size === values.length;
const validDate = value => {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function normalizeCardOrder(value) {
  return [...new Set([...(Array.isArray(value) ? value : []), ...CARD_IDS])].filter(id => CARD_IDS.includes(id));
}

export function visibleCardIds(hidden, optional) {
  const excluded = Array.isArray(hidden) ? hidden : [];
  const enabled = Array.isArray(optional) ? optional : [];
  return CARD_IDS.filter(id => !excluded.includes(id) && (!OPTIONAL_CARD_IDS.includes(id) || enabled.includes(id)));
}

function validQuiz(value) {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.quizzes) || value.quizzes.length > 1000) return false;
  const quizIds = [];
  for (const quiz of value.quizzes) {
    if (!record(quiz) || !text(quiz.id) || !text(quiz.name) || !quiz.name.trim() || quiz.name.length > 200 ||
        !optional(quiz.description, v => text(v) && v.length <= 1000) ||
        !Array.isArray(quiz.cards) || quiz.cards.length > 20000) return false;
    quizIds.push(quiz.id);
    const cardIds = [];
    for (const card of quiz.cards) {
      if (!record(card) || !text(card.id) || !text(card.question) || !card.question.trim() || card.question.length > 10000 ||
          !text(card.answer) || !card.answer.trim() || card.answer.length > 10000 ||
          !optional(card.notes, v => text(v) && v.length <= 20000) ||
          !optional(card.wrongAnswers, v => Array.isArray(v) && v.length <= 3 && v.every(a => text(a) && a.length <= 10000))) return false;
      cardIds.push(card.id);
    }
    if (!unique(cardIds)) return false;
  }
  return unique(quizIds) && optional(value.settings, record) && optional(value.history, Array.isArray);
}

function validValue(key, raw) {
  if (key === 'timeuntil.clock.color.v1') return themes.includes(raw);
  let value;
  try { value = JSON.parse(raw); } catch { return false; }
  if (key === 'format-lizard.workspace.v2' && raw.length > 1024 * 1024) return false;
  switch (key) {
    case LUFTBLASEN_KEY:
      return validLuftblasenProgress(value);
    case OPTIONAL_CARDS_KEY:
      return Array.isArray(value) && value.every(id => OPTIONAL_CARD_IDS.includes(id)) && unique(value);
    case RECENT_TOOLS_KEY:
      return validRecentTools(value);
    case 'lizard-dashboard.hidden-cards.v1':
    case 'lizard-dashboard.card-order.v1':
      return Array.isArray(value) && value.every(id => CARD_IDS.includes(id)) && unique(value);
    case 'todo-lizard:v1':
      return Array.isArray(value) && value.length <= 5000 && value.every(task =>
        record(task) && text(task.title) && task.title.trim() && task.title.length <= 300 &&
        optional(task.id, v => text(v) && v.length > 0 && v.length <= 100) &&
        optional(task.dueDate, v => v === '' || validDate(v)) &&
        optional(task.priority, choices(['low', 'normal', 'high'])) &&
        optional(task.completed, v => typeof v === 'boolean') &&
        optional(task.createdAt, dateTime) && optional(task.completedAt, v => v === null || dateTime(v)));
    case 'todo-lizard:settings:v1':
      return record(value) && optional(value.search, text) &&
        optional(value.filter, choices(['all', 'active', 'completed'])) &&
        optional(value.sort, choices(['created-desc', 'created-asc', 'due', 'priority', 'alphabetical']));
    case 'timeuntil.events.v1':
      return record(value) && Array.isArray(value.events) && value.events.length <= 10000 &&
        optional(value.selected, v => v === null || text(v)) && value.events.every(event =>
          record(event) && text(event.id) && event.id.length > 0 && event.id.length <= 200 &&
          text(event.name) && event.name.trim() && event.name.length <= 80 && dateTime(event.target) &&
          new Date(event.target).getFullYear() >= 1 && new Date(event.target).getFullYear() <= 9999 && themes.includes(event.color));
    case 'quiz-your-lizard:v1':
      return validQuiz(value);
    case 'weather-lizard.location.v1':
      return record(value) && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
        Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 && optional(value.label, text);
    case 'format-lizard.workspace.v1':
    case 'format-lizard.workspace.v2':
      return record(value) && text(value.input) && text(value.output) &&
        ['format', 'indent', 'view'].every(field => optional(value[field], text)) &&
        optional(value.sortKeys, v => typeof v === 'boolean') && optional(value.outputFormat, v => v === null || text(v));
    case 'compare-lizard.workspace.v1':
      return record(value) && text(value.left) && text(value.right) && Array.isArray(value.rows) &&
        value.rows.every(row => record(row) && text(row.path) && ['added', 'removed', 'changed', 'equal'].includes(row.type)) &&
        ['format', 'mode', 'filter'].every(field => optional(value[field], text)) &&
        ['strictValues', 'ignoreKeyOrder', 'includeEqual'].every(field => optional(value[field], v => typeof v === 'boolean'));
    case 'delim-lizard.workspace.v1':
      return record(value) && text(value.input) && record(value.settings) &&
        ['preset', 'delimiter', 'customDelimiter', 'quoteStyle', 'prefix', 'suffix', 'inputSeparator', 'customInputSeparator']
          .every(field => optional(value.settings[field], text)) &&
        ['trimValues', 'removeBlanks', 'removeDuplicates', 'sortValues']
          .every(field => optional(value.settings[field], v => typeof v === 'boolean'));
    default:
      return false;
  }
}

export function createBackup(storage, { origin = '', now = new Date() } = {}) {
  const apps = {};
  for (const app of BACKUP_APPS) {
    const entries = Object.fromEntries(app.keys.map(key => [key, storage.getItem(key)]));
    if (Object.values(entries).some(raw => raw !== null)) apps[app.id] = entries;
  }
  return { app: 'lizard-dashboard', schemaVersion: 1, exportedAt: now.toISOString(), sourceOrigin: origin, apps };
}

export function parseBackup(source) {
  if (!text(source) || new TextEncoder().encode(source).length > MAX_BACKUP_BYTES) {
    throw new Error('Choose a backup smaller than 32 MB.');
  }
  let backup;
  try { backup = JSON.parse(source); } catch { throw new Error('This file is not valid JSON. Choose a Lizard Dashboard backup.'); }
  if (!record(backup) || backup.app !== 'lizard-dashboard' || !record(backup.apps) || !dateTime(backup.exportedAt)) {
    throw new Error('Choose a backup downloaded from Lizard Dashboard.');
  }
  if (backup.schemaVersion !== 1) throw new Error('This backup uses an unsupported format version.');
  const apps = {};
  for (const [id, entries] of Object.entries(backup.apps)) {
    const app = BACKUP_APPS.find(app => app.id === id);
    if (!app) throw new Error('This backup includes an app this dashboard does not support.');
    if (!record(entries) || !Object.keys(entries).length) throw new Error(app.name + ' has no saved entries in this backup.');
    for (const [key, raw] of Object.entries(entries)) {
      if (!app.keys.includes(key) || (raw !== null && (!text(raw) || !validValue(key, raw)))) {
        throw new Error(app.name + ' contains invalid or unsupported saved data. Nothing was restored.');
      }
    }
    apps[id] = { ...entries };
  }
  if (!Object.keys(apps).length) throw new Error('This backup does not contain any saved app data.');
  return { app: 'lizard-dashboard', schemaVersion: 1, exportedAt: backup.exportedAt, apps };
}

export function describeApp(app, entries) {
  if (!entries || !Object.values(entries).some(raw => raw !== null)) return 'No saved data';
  try {
    const raw = entries[app.keys[0]];
    const value = raw == null ? null : JSON.parse(raw);
    if (app.id === 'todo' && Array.isArray(value)) return value.length + (value.length === 1 ? ' task' : ' tasks') + ' · list preferences';
    if (app.id === 'luftblasen' && Array.isArray(value?.scores)) return value.scores.length + (value.scores.length === 1 ? ' saved score' : ' saved scores') + ' · game preferences';
    if (app.id === 'timeuntil' && Array.isArray(value?.events)) return value.events.length + (value.events.length === 1 ? ' countdown' : ' countdowns') + ' · clock preferences';
    if (app.id === 'quiz' && Array.isArray(value?.quizzes)) {
      const historyCount = value.history?.length || 0;
      return value.quizzes.length + (value.quizzes.length === 1 ? ' quiz' : ' quizzes') + ' · ' +
        historyCount + (historyCount === 1 ? ' practice result' : ' practice results');
    }
  } catch { /* Preserve unreadable originals in exports so they can still be recovered. */ }
  return app.detail;
}

export function captureRestoreState(storage, backup) {
  return Object.fromEntries(Object.values(backup.apps).flatMap(entries =>
    Object.keys(entries).map(key => [key, storage.getItem(key)])));
}

export function restoreBackup(storage, backup, selectedIds, expectedState) {
  // Validate again at the write boundary, even if a caller skipped the preview.
  const checked = parseBackup(JSON.stringify(backup));
  if (!Array.isArray(selectedIds) || !selectedIds.length || !unique(selectedIds) ||
      selectedIds.some(id => !Object.hasOwn(checked.apps, id))) throw new Error('Choose at least one app from this backup.');
  const apps = Object.fromEntries(selectedIds.map(id => [id, checked.apps[id]]));
  const entries = Object.entries(apps).flatMap(([, entries]) => Object.entries(entries));
  const before = Object.fromEntries(entries.map(([key]) => [key, storage.getItem(key)]));
  if (expectedState && entries.some(([key]) => !Object.hasOwn(expectedState, key) || expectedState[key] !== before[key])) {
    throw new Error('Saved data changed after this preview. Choose the backup again to review the latest data.');
  }
  const changes = entries.filter(([key, raw]) => before[key] !== raw);
  const touched = [];
  try {
    // Free space from shrinking values and removals before writing larger values.
    changes.sort(([a, nextA], [b, nextB]) => ((nextA?.length || 0) - (before[a]?.length || 0)) -
      ((nextB?.length || 0) - (before[b]?.length || 0)));
    for (const [key, raw] of changes) {
      if (raw === null) storage.removeItem(key);
      else storage.setItem(key, raw);
      touched.push(key);
    }
  } catch {
    let rollbackFailed = false;
    // Remove only entries that actually changed. The failed write is atomic.
    try {
      for (const key of touched) storage.removeItem(key);
      for (const key of touched) if (before[key] !== null) storage.setItem(key, before[key]);
    } catch { rollbackFailed = true; }
    const error = new Error(rollbackFailed
      ? 'Restore could not finish. Download the recovery backup below to recover the previous data.'
      : 'Restore could not be saved. Your previous data was kept. Free some browser storage and try again.');
    if (rollbackFailed) error.recovery = {
      app: 'lizard-dashboard', schemaVersion: 1, exportedAt: new Date().toISOString(),
      apps: Object.fromEntries(selectedIds.map(id => [id, Object.fromEntries(Object.keys(apps[id]).map(key => [key, before[key]]))]))
    };
    throw error;
  }
  return entries.map(([key]) => key);
}
