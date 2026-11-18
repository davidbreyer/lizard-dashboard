import test from 'node:test';
import assert from 'node:assert/strict';
import { initKeepAwake } from '../wake-lock.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
class Lock extends EventTarget {
  released = false;
  releases = 0;
  async release() { this.releases++; this.released = true; this.dispatchEvent(new Event('release')); }
}
function setup(request) {
  const page = Object.assign(new EventTarget(), { isSecureContext: true });
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const toggle = Object.assign(new EventTarget(), { checked: true, disabled: false });
  const status = { textContent: '' };
  const locks = [], calls = [];
  const browser = { wakeLock: { request(type) {
    calls.push(type);
    if (request) return request();
    const lock = new Lock(); locks.push(lock); return Promise.resolve(lock);
  } } };
  initKeepAwake({ page, doc, browser, toggle, status });
  const change = value => { toggle.checked = value; toggle.dispatchEvent(new Event('change')); };
  const visibility = hidden => { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')); };
  return { page, doc, toggle, status, locks, calls, change, visibility };
}

test('keep awake starts off and only requests a lock after the user enables it', async () => {
  const env = setup();
  assert.equal(env.toggle.checked, false);
  assert.equal(env.status.textContent, 'Off');
  assert.deepEqual(env.calls, []);
  env.change(true);
  assert.equal(env.status.textContent, 'Starting…');
  await settle();
  assert.equal(env.status.textContent, 'Active');
  assert.deepEqual(env.calls, ['screen']);
  env.change(false);
  assert.equal(env.locks[0].released, true);
  assert.equal(env.status.textContent, 'Off');
});

test('hidden dashboards release the lock and reacquire on return', async () => {
  const env = setup(); env.change(true); await settle();
  env.visibility(true);
  assert.equal(env.locks[0].released, true);
  assert.equal(env.status.textContent, 'Paused');
  assert.equal(env.toggle.checked, true);
  env.visibility(false); await settle();
  assert.equal(env.calls.length, 2);
  assert.equal(env.status.textContent, 'Active');
  assert.equal(env.locks[1].released, false);
});

test('leaving the page releases its lock; page return resumes only an enabled choice', async () => {
  const env = setup(); env.change(true); await settle();
  env.page.dispatchEvent(new Event('pagehide'));
  assert.equal(env.locks[0].released, true);
  env.page.dispatchEvent(new Event('focus')); await settle();
  assert.equal(env.calls.length, 1);
  env.page.dispatchEvent(new Event('pageshow')); await settle();
  assert.equal(env.calls.length, 2);
  env.change(false);
  env.page.dispatchEvent(new Event('pagehide'));
  env.page.dispatchEvent(new Event('pageshow')); await settle();
  assert.equal(env.calls.length, 2);
  assert.equal(env.status.textContent, 'Off');
});

test('a delayed acquisition is released if the user already turned the option off', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const env = setup(() => pending);
  env.change(true); env.change(false);
  const lock = new Lock(); resolve(lock); await settle();
  assert.equal(lock.released, true);
  assert.equal(lock.releases, 1);
  assert.equal(env.status.textContent, 'Off');
  assert.equal(env.toggle.checked, false);
});

test('a stale pending request cannot remain active after a hide and return', async () => {
  let resolve, requestCount = 0;
  const old = new Lock(), fresh = new Lock();
  const env = setup(() => ++requestCount === 1 ? new Promise(done => { resolve = done; }) : Promise.resolve(fresh));
  env.change(true); env.visibility(true); env.visibility(false);
  resolve(old); await settle();
  assert.equal(old.released, true);
  assert.equal(fresh.released, false);
  assert.equal(env.calls.length, 2);
  assert.equal(env.status.textContent, 'Active');
});

test('a denied request is shown as unavailable and can be retried explicitly', async () => {
  let requestCount = 0;
  const env = setup(() => ++requestCount === 1 ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(new Lock()));
  env.change(true); await settle();
  assert.equal(env.toggle.checked, false);
  assert.match(env.status.textContent, /Unavailable/);
  env.change(true); await settle();
  assert.equal(env.status.textContent, 'Active');
});

test('browser-initiated release updates the status instead of claiming the screen is still awake', async () => {
  const env = setup(); env.change(true); await settle();
  await env.locks[0].release();
  assert.match(env.status.textContent, /Paused/);
  env.page.dispatchEvent(new Event('focus')); await settle();
  assert.equal(env.status.textContent, 'Active');
  assert.equal(env.calls.length, 2);
});

test('unsupported and insecure browsers get a disabled control and a clear status', () => {
  for (const [secure, browser, expected] of [
    [true, {}, /Not supported/],
    [false, { wakeLock: { request() { throw new Error('Must not request'); } } }, /secure connection/]
  ]) {
    const toggle = { checked: true, disabled: false }, status = { textContent: '' };
    initKeepAwake({ page: { isSecureContext: secure }, doc: {}, browser, toggle, status });
    assert.equal(toggle.checked, false);
    assert.equal(toggle.disabled, true);
    assert.match(status.textContent, expected);
  }
});
