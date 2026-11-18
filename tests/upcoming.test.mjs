import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUpcoming } from '../upcoming.mjs';

process.env.TZ = 'America/New_York';
const now = new Date('2026-11-18T12:00:00-05:00');
const task = (title, dueDate, extra = {}) => ({ title, dueDate, completed: false, ...extra });
const event = (name, target) => ({ id: name, name, target });

test('combines open dated tasks and future events across exactly seven local calendar days', () => {
  const result = buildUpcoming({
    tasks: [
      task('Today normal', '2026-11-18'), task('Today important', '2026-11-18', { priority: 'high' }),
      task('Tomorrow', '2026-11-19'), task('Last day', '2026-11-24'),
      task('Outside', '2026-11-25'), task('Overdue', '2026-11-17'),
      task('Done', '2026-11-18', { completed: true }), task('Undated', ''), task('Invalid', '2026-11-31')
    ],
    events: [
      event('Later today', '2026-11-18T13:00:00-05:00'),
      event('Sooner today', '2026-11-18T12:30:00-05:00'),
      event('Already passed', '2026-11-18T11:59:59-05:00'),
      event('Exactly now', now.toISOString()), event('Last night', '2026-11-24T23:59:59-05:00'),
      event('Next week', '2026-11-25T00:00:00-05:00')
    ]
  }, now);
  assert.equal(result.startKey, '2026-11-18');
  assert.equal(result.endKey, '2026-11-25');
  assert.deepEqual(result.items.map(item => item.title), [
    'Today important', 'Today normal', 'Sooner today', 'Later today', 'Tomorrow', 'Last day', 'Last night'
  ]);
  assert.equal(result.refreshAt, Date.parse('2026-11-18T12:30:00-05:00'));
});

test('UTC countdown timestamps are grouped by the local day without shifting date-only tasks', () => {
  const result = buildUpcoming({
    tasks: [task('Date-only task', '2026-11-18')],
    events: [event('Evening event', '2026-11-19T02:00:00Z')]
  }, now);
  assert.deepEqual(result.items.map(item => item.dateKey), ['2026-11-18', '2026-11-18']);
  assert.equal(result.items[1].timestamp, Date.parse('2026-11-19T02:00:00Z'));
});

test('the window follows local calendar days across spring daylight saving time', () => {
  const result = buildUpcoming({ events: [
    event('Last evening', '2027-03-18T23:59:59-04:00'),
    event('Too late', '2027-03-19T00:30:00-04:00')
  ] }, new Date('2027-03-12T12:00:00-05:00'));
  assert.equal(result.endKey, '2027-03-19');
  assert.deepEqual(result.items.map(item => item.title), ['Last evening']);
});

test('the extra hour at the autumn daylight saving boundary is included', () => {
  const result = buildUpcoming({ events: [
    event('Last evening', '2026-11-05T23:30:00-05:00'),
    event('Next day', '2026-11-06T00:00:00-05:00')
  ] }, new Date('2026-10-30T12:00:00-04:00'));
  assert.equal(result.endKey, '2026-11-06');
  assert.deepEqual(result.items.map(item => item.title), ['Last evening']);
});

test('month/year boundaries and leap days preserve valid task dates', () => {
  const year = buildUpcoming({ tasks: [task('New year', '2027-01-01'), task('Outside', '2027-01-05')] }, new Date('2026-12-29T12:00:00-05:00'));
  assert.equal(year.endKey, '2027-01-05');
  assert.deepEqual(year.items.map(item => item.dateKey), ['2027-01-01']);
  const leap = buildUpcoming({ tasks: [task('Leap day', '2028-02-29'), task('Invalid', '2028-02-30')] }, new Date('2028-02-28T12:00:00-05:00'));
  assert.deepEqual(leap.items.map(item => item.title), ['Leap day']);
});

test('elapsed events disappear on refresh and the next calendar day moves the window', () => {
  const input = {
    tasks: [task('Today', '2026-11-18'), task('New final day', '2026-11-25')],
    events: [event('Soon', '2026-11-18T12:00:01-05:00')]
  };
  const before = JSON.stringify(input);
  const initial = buildUpcoming(input, now);
  assert.equal(initial.refreshAt, now.getTime() + 1000);
  assert.equal(buildUpcoming(input, new Date(initial.refreshAt)).items.some(item => item.kind === 'event'), false);
  const tomorrow = buildUpcoming(input, new Date('2026-11-19T00:00:00-05:00'));
  assert.deepEqual(tomorrow.items.map(item => item.title), ['New final day']);
  assert.equal(tomorrow.refreshAt, Date.parse('2026-11-20T00:00:00-05:00'));
  assert.equal(JSON.stringify(input), before, 'Reading the schedule must not change source records');
});

test('malformed records are ignored and matching task/event names remain distinct', () => {
  const result = buildUpcoming({
    tasks: [null, {}, task(' ', '2026-11-18'), task('Same name', '2026-11-18')],
    events: [null, {}, event('Broken', 'not a date'), event('Same name', '2026-11-18T13:00:00-05:00')]
  }, now);
  assert.deepEqual(result.items.map(item => item.kind), ['task', 'event']);
  assert.deepEqual(buildUpcoming({ tasks: {}, events: null }, now).items, []);
  assert.equal(buildUpcoming({}, now).refreshAt, Date.parse('2026-11-19T00:00:00-05:00'));
});
