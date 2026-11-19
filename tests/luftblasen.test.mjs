import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './fixtures.mjs';
import { LUFTBLASEN_KEY, luftblasenBests, validLuftblasenProgress, validLuftblasenScore } from '../luftblasen.mjs';
import { CARD_IDS, OPTIONAL_CARDS_KEY, visibleCardIds, BACKUP_APPS, createBackup, parseBackup, restoreBackup, describeApp } from '../backup.mjs';

const progress = () => JSON.parse(fixtures[LUFTBLASEN_KEY]);
const score = overrides => ({ ...progress().scores[0], ...overrides });
class Storage {
  constructor(entries = {}) { this.entries = new Map(Object.entries(entries)); }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { this.entries.set(key, value); }
  removeItem(key) { this.entries.delete(key); }
}

test('Luftblasen stays off for fresh, existing and corrupt card preferences until explicitly enabled', () => {
  const standard = CARD_IDS.filter(id => id !== 'luftblasen-card');
  for (const hidden of [undefined, null, [], {}, 'bad']) assert.deepEqual(visibleCardIds(hidden, null), standard);
  assert.deepEqual(visibleCardIds(['quiz-card'], []), standard.filter(id => id !== 'quiz-card'));
  assert.deepEqual(visibleCardIds([], ['luftblasen-card']), CARD_IDS);
  assert.deepEqual(visibleCardIds(['luftblasen-card'], ['luftblasen-card']), standard);
  assert.deepEqual(visibleCardIds([], ['unknown']), standard);
  assert.deepEqual(visibleCardIds([], {}), standard);
});

test('personal bests are ranked within each difficulty without modifying the game data', () => {
  const value = progress();
  value.scores.push(score({ score: 25000 }), score({ score: 5, difficulty: 5 }), score({ score: 0, difficulty: 1 }));
  const original = JSON.stringify(value);
  const bests = luftblasenBests(value);
  assert.deepEqual(bests.map(({ name, best }) => [name, best?.score ?? null]), [['Easy', 0], ['Casual', null], ['Medium', 25000], ['Quick', null], ['Hard', 5]]);
  assert.equal(JSON.stringify(value), original);
});

test('summary ignores scores the game would reject and handles empty or unsupported saves', () => {
  assert(luftblasenBests(null).every(({ best }) => best === null));
  assert(luftblasenBests({ version: 1, scores: [] }).every(({ best }) => best === null));
  const invalid = [null, score({ score: -1 }), score({ score: Number.MAX_SAFE_INTEGER + 1 }), score({ scoringVersion: 2 }), score({ difficulty: 0 }), score({ round: 0 }), score({ theme: 'unknown' }), score({ date: 'bad' }), score({ timePlayedMs: 1.5 })];
  for (const item of invalid) assert.equal(Boolean(validLuftblasenScore(item)), false);
  assert(luftblasenBests({ version: 1, scores: invalid }).every(({ best }) => best === null));
  for (const value of [{ version: 2, scores: [] }, [], { version: 1, scores: 'bad' }]) assert.throws(() => luftblasenBests(value), /Unsupported/);
});

test('backup restores all score metadata and settings independently from the game-card opt-in', () => {
  const source = new Storage({ [LUFTBLASEN_KEY]: fixtures[LUFTBLASEN_KEY], [OPTIONAL_CARDS_KEY]: '["luftblasen-card"]' });
  const backup = parseBackup(JSON.stringify(createBackup(source)));
  const target = new Storage({ unrelated: 'keep' });
  restoreBackup(target, backup, ['luftblasen']);
  assert.equal(target.getItem(LUFTBLASEN_KEY), fixtures[LUFTBLASEN_KEY]);
  assert.equal(target.getItem(OPTIONAL_CARDS_KEY), null);
  assert.equal(visibleCardIds([], JSON.parse(target.getItem(OPTIONAL_CARDS_KEY))).includes('luftblasen-card'), false);
  restoreBackup(target, backup, ['dashboard']);
  assert.equal(target.getItem(OPTIONAL_CARDS_KEY), '["luftblasen-card"]');
  assert.equal(target.getItem('unrelated'), 'keep');
  assert.equal(describeApp(BACKUP_APPS.find(app => app.id === 'luftblasen'), backup.apps.luftblasen), '1 saved score · game preferences');
});

test('invalid game backups or unsupported opt-in values are rejected before writes', () => {
  assert(validLuftblasenProgress(progress()));
  for (const value of [{ ...progress(), version: 2 }, { ...progress(), scores: [score({ score: -1 })] }, { ...progress(), settings: { difficulty: 6 } }]) {
    const backup = createBackup(new Storage({ [LUFTBLASEN_KEY]: JSON.stringify(value) }));
    assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid or unsupported/);
  }
  const backup = createBackup(new Storage({ [OPTIONAL_CARDS_KEY]: '["weather-card"]' }));
  assert.throws(() => parseBackup(JSON.stringify(backup)), /invalid or unsupported/);
});
