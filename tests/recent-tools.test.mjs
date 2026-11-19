import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECENT_TOOLS_KEY, TOOLS, normalizeRecentTools, validRecentTools, toolForUrl, recordRecentTool, recentShortcuts } from '../recent-tools.mjs';

class Storage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); this.writes = 0; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes++; this.values.set(key, value); }
}

test('launches are ordered by most recent use without duplicates or extra app data', () => {
  const storage = new Storage({ 'todo-lizard:v1': '[]', unrelated: 'keep' });
  for (const id of ['compare-lizard', 'delim-lizard', 'format-lizard', 'delim-lizard']) recordRecentTool(storage, id);
  assert.deepEqual(JSON.parse(storage.getItem(RECENT_TOOLS_KEY)), ['delim-lizard', 'format-lizard', 'compare-lizard']);
  assert.equal(storage.getItem('todo-lizard:v1'), '[]');
  assert.equal(storage.getItem('unrelated'), 'keep');
  const writes = storage.writes;
  recordRecentTool(storage, 'delim-lizard');
  assert.equal(storage.writes, writes, 'An unchanged order needs no new write');
});

test('all six tools fit in history while the dashboard shows the last three actually opened', () => {
  const storage = new Storage();
  for (const tool of TOOLS) recordRecentTool(storage, tool.id);
  const history = JSON.parse(storage.getItem(RECENT_TOOLS_KEY));
  assert.equal(history.length, 6);
  assert.deepEqual(recentShortcuts(history).map(tool => tool.id), ['delim-lizard', 'datetime-lizard', 'duplicate-lizard']);
  assert.deepEqual(recentShortcuts(['delim-lizard']).map(tool => tool.id), ['delim-lizard']);
  assert.deepEqual(recentShortcuts([]).map(tool => tool.id), ['format-lizard', 'compare-lizard', 'mock-lizard']);
});

test('one pin leads defaults or recent tools without duplicates or changing the history', () => {
  const ids = (history, pin) => recentShortcuts(history, pin).map(tool => tool.id);
  assert.deepEqual(ids([], 'delim-lizard'), ['delim-lizard', 'format-lizard', 'compare-lizard']);
  const history = ['mock-lizard', 'compare-lizard', 'format-lizard'];
  assert.deepEqual(ids(history, 'compare-lizard'), ['compare-lizard', 'mock-lizard', 'format-lizard']);
  assert.deepEqual(ids(history, 'unknown'), history);
});

test('only known tool destinations on the correct site are recorded', () => {
  assert.equal(toolForUrl('https://www.davidbreyer.com/delim-lizard/').id, 'delim-lizard');
  assert.equal(toolForUrl('/compare-lizard?example=true#results').id, 'compare-lizard');
  for (const url of [
    'https://evil.example/compare-lizard/', 'https://davidbreyer.com/compare-lizard/',
    'http://www.davidbreyer.com/compare-lizard/', 'https://user@www.davidbreyer.com/compare-lizard/',
    'https://www.davidbreyer.com/todo-lizard/', 'https://www.davidbreyer.com/timeuntil/',
    'https://www.davidbreyer.com/weather-lizard/', 'https://www.davidbreyer.com/tools/',
    'javascript:alert(1)'
  ]) assert.equal(toolForUrl(url), null, url);
  const storage = new Storage();
  assert.equal(recordRecentTool(storage, 'todo-lizard'), false);
  assert.equal(storage.writes, 0);
});

test('live history tolerates corrupt metadata while backup validation rejects it', () => {
  assert.deepEqual(normalizeRecentTools(['delim-lizard', null, 'unknown', 'delim-lizard', 'format-lizard']), ['delim-lizard', 'format-lizard']);
  assert.deepEqual(normalizeRecentTools({ invalid: true }), []);
  for (const value of [null, {}, ['unknown'], ['delim-lizard', 'delim-lizard'], [3]]) assert.equal(validRecentTools(value), false);
  assert.equal(validRecentTools([]), true);
  const storage = new Storage({ [RECENT_TOOLS_KEY]: 'broken', other: 'keep' });
  recordRecentTool(storage, 'mock-lizard');
  assert.equal(storage.getItem(RECENT_TOOLS_KEY), '["mock-lizard"]');
  assert.equal(storage.getItem('other'), 'keep');
});

test('failed storage access propagates without a partially updated history', () => {
  const storage = new Storage({ [RECENT_TOOLS_KEY]: '["delim-lizard"]' });
  storage.setItem = () => { throw new Error('Storage unavailable'); };
  assert.throws(() => recordRecentTool(storage, 'compare-lizard'), /unavailable/);
  assert.equal(storage.getItem(RECENT_TOOLS_KEY), '["delim-lizard"]');
});

test('the dashboard Tools directory and history catalog cover the same tools', () => {
  const html = readFileSync(new URL('../tools/index.html', import.meta.url), 'utf8');
  const links = [...html.matchAll(/class="tool(?: tool-featured)?" href="([^"]+)"/g)].map(match => toolForUrl(match[1])?.id);
  assert.deepEqual(links.sort(), TOOLS.map(tool => tool.id).sort());
});
