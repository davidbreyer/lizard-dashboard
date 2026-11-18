import test from 'node:test';
import { fixtures } from './fixtures.mjs';
import assert from 'node:assert/strict';
import { CARD_IDS, BACKUP_APPS, normalizeCardOrder, createBackup, parseBackup, describeApp, captureRestoreState, restoreBackup } from '../backup.mjs';

class Storage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); this.writes = 0; this.failAt = Infinity; this.persistent = false; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    this.writes++;
    if (this.writes === this.failAt || (this.persistent && this.writes >= this.failAt)) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key) { this.values.delete(key); }
  snapshot() { return Object.fromEntries(this.values); }
}
const json = JSON.stringify;

const backup = storage => createBackup(storage, { now: new Date('2026-11-18T12:00:00Z'), origin: 'https://www.davidbreyer.com' });
const parsed = () => parseBackup(json(backup(new Storage(fixtures))));

test('exports only audited keys and exactly preserves all nine app snapshots', () => {
  const source = new Storage({ ...fixtures, unrelated: 'leave me alone', 'future-app.secret': 'private' });
  const data = backup(source);
  assert.equal(Object.keys(data.apps).length, 9);
  assert.equal(Object.values(data.apps).flatMap(Object.keys).length, 12);
  assert(!json(data).includes('leave me alone'));
  const destination = new Storage({ unrelated: 'untouched' });
  restoreBackup(destination, parseBackup(json(data)), Object.keys(data.apps));
  assert.deepEqual(destination.snapshot(), { unrelated: 'untouched', ...fixtures });
  assert.deepEqual(source.snapshot(), { ...fixtures, unrelated: 'leave me alone', 'future-app.secret': 'private' });
});

test('restores only selected apps, including settings absent from the snapshot', () => {
  const incoming = parseBackup(json(backup(new Storage({ 'todo-lizard:v1': '[]' }))));
  assert.equal(incoming.apps.todo['todo-lizard:settings:v1'], null);
  const target = new Storage(fixtures);
  const keys = restoreBackup(target, incoming, ['todo']);
  assert.deepEqual(keys.sort(), ['todo-lizard:settings:v1', 'todo-lizard:v1']);
  assert.equal(target.getItem('todo-lizard:v1'), '[]');
  assert.equal(target.getItem('todo-lizard:settings:v1'), null);
  assert.equal(target.getItem('quiz-your-lizard:v1'), fixtures['quiz-your-lizard:v1']);
});

test('an omitted key from an older backup is left alone', () => {
  const data = { ...parsed(), apps: { todo: { 'todo-lizard:v1': '[]' } } };
  const target = new Storage(fixtures);
  restoreBackup(target, data, ['todo']);
  assert.equal(target.getItem('todo-lizard:settings:v1'), fixtures['todo-lizard:settings:v1']);
});

test('preview and parsing do not write; a stale preview refuses to overwrite a newer task', () => {
  const source = new Storage(fixtures), data = parsed();
  const expected = captureRestoreState(source, data);
  assert.equal(source.writes, 0);
  source.setItem('todo-lizard:v1', '[]');
  const before = source.snapshot();
  assert.throws(() => restoreBackup(source, data, ['todo'], expected), /changed after this preview/);
  assert.deepEqual(source.snapshot(), before);
  // A change to an unselected app does not prevent a selective restore.
  restoreBackup(source, data, ['weather'], expected);
});

test('unsupported versions, keys, apps, shapes and malicious property names are rejected', () => {
  const cases = [
    { ...parsed(), schemaVersion: 2 },
    { ...parsed(), apps: { unknown: { value: 'secret' } } },
    { ...parsed(), apps: { todo: { unrelated: '[]' } } },
    { ...parsed(), apps: { todo: [] } },
    JSON.parse('{"app":"lizard-dashboard","schemaVersion":1,"exportedAt":"2026-11-18","apps":{"__proto__":{"polluted":"yes"}}}'),
    { ...parsed(), apps: { todo: { 'todo-lizard:v1': '[{"title":"bad","dueDate":"2026-02-30"}]' } } },
    { ...parsed(), apps: { weather: { 'weather-lizard.location.v1': '{"latitude":100,"longitude":0}' } } },
    { ...parsed(), apps: { timeuntil: { 'timeuntil.clock.color.v1': '"violet"' } } },
    { ...parsed(), apps: { format: { 'format-lizard.workspace.v1': '{"input":4,"output":""}' } } },
    { ...parsed(), apps: { compare: { 'compare-lizard.workspace.v1': '{"left":"","right":"","rows":[{"path":"x","type":"html"}]}' } } },
    { ...parsed(), apps: { quiz: { 'quiz-your-lizard:v1': json({ version: 1, quizzes: [{ id: 'q', name: 'q', cards: [{ id: 'c', question: 'q', answer: 'a' }, { id: 'c', question: 'q', answer: 'a' }] }] }) } } }
  ];
  for (const data of cases) {
    const target = new Storage(fixtures);
    assert.throws(() => restoreBackup(target, data, ['todo']));
    assert.deepEqual(target.snapshot(), fixtures);
    assert.equal(target.writes, 0);
  }
  assert.equal({}.polluted, undefined);
  assert.throws(() => parseBackup('nope'), /not valid JSON/);
  assert.throws(() => parseBackup(json({ app: 'timeuntil', events: [] })), /Lizard Dashboard/);
});

test('requires an explicit nonempty set of apps from this backup', () => {
  for (const selected of [[], ['todo', 'todo'], ['not-present'], null]) {
    const target = new Storage();
    assert.throws(() => restoreBackup(target, parsed(), selected), /Choose at least one/);
    assert.equal(target.writes, 0);
  }
});

test('failed multi-app writes roll back previous strings and remove newly added entries', () => {
  const target = new Storage({ 'todo-lizard:v1': '[]', unrelated: 'keep' });
  const before = target.snapshot();
  target.failAt = 2;
  assert.throws(() => restoreBackup(target, parsed(), ['todo', 'timeuntil']), /previous data was kept/);
  assert.deepEqual(target.snapshot(), before);
});

test('persistent write failure exposes a recovery snapshot of the previous data', () => {
  const target = new Storage({ ...fixtures, 'timeuntil.clock.color.v1': 'gold' });
  target.failAt = 2;
  target.persistent = true;
  const incoming = parsed();
  incoming.apps.todo['todo-lizard:settings:v1'] = json({ filter: 'all' });
  let failure;
  try { restoreBackup(target, incoming, ['todo', 'timeuntil']); } catch (error) { failure = error; }
  assert.match(failure.message, /recovery backup/);
  const recovery = parseBackup(json(failure.recovery));
  assert.equal(recovery.apps.timeuntil['timeuntil.clock.color.v1'], 'gold');
  assert.equal(recovery.apps.todo['todo-lizard:settings:v1'], fixtures['todo-lizard:settings:v1']);
});

test('an unchanged restore performs no writes', () => {
  const target = new Storage(fixtures);
  restoreBackup(target, parsed(), Object.keys(parsed().apps));
  assert.equal(target.writes, 0);
});

test('card order normalization preserves valid choices and appends missing/new cards', () => {
  assert.deepEqual(normalizeCardOrder(['todo-card', 'todo-card', 'unknown']), ['todo-card', 'weather-card', 'countdown-card', 'quiz-card']);
  assert.deepEqual(normalizeCardOrder(null), CARD_IDS);
  assert.deepEqual(normalizeCardOrder({ invalid: true }), CARD_IDS);
});

test('inventory reports countdown totals even though clock color is stored as plain text', () => {
  assert.equal(describeApp(BACKUP_APPS.find(app => app.id === 'timeuntil'), parsed().apps.timeuntil), '1 countdown · clock preferences');
  assert.equal(describeApp(BACKUP_APPS[0], undefined), 'No saved data');
});
