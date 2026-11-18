import test from 'node:test';
import assert from 'node:assert/strict';
import { clockState, CLOCK_COLORS, CLOCK_COLOR_KEY } from '../clock.mjs';
import { BACKUP_APPS } from '../backup.mjs';

process.env.TZ = 'America/New_York';

test('clock uses padded local 24-hour hours and minutes, with remaining second dots', () => {
  const time = clockState(new Date('2026-11-19T02:03:45Z'));
  assert.equal(time.time, '21:03');
  assert.equal(time.elapsed, 45);
  assert.equal(time.remaining, 15);
  assert.equal(time.dateTime, '2026-11-19T02:03:45.000Z');
});

test('seconds reset to sixty at minute and local midnight boundaries', () => {
  assert.deepEqual(clockState(new Date('2026-11-18T23:59:59-05:00')), {
    time: '23:59', elapsed: 59, remaining: 1, dateTime: '2026-11-19T04:59:59.000Z'
  });
  const next = clockState(new Date('2026-11-19T00:00:00-05:00'));
  assert.equal(next.time, '00:00');
  assert.equal(next.elapsed, 0);
  assert.equal(next.remaining, 60);
});

test('clock color uses the existing Time Until backup entry and themes', () => {
  assert(BACKUP_APPS.find(app => app.id === 'timeuntil').keys.includes(CLOCK_COLOR_KEY));
  assert.deepEqual(Object.keys(CLOCK_COLORS), ['ember', 'violet', 'tidal', 'gold']);
});
