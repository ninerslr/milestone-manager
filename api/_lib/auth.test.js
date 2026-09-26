// Login, session cookie, attempt limits, and that routes refuse visitors
// who are not signed in. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { PGlite } from '@electric-sql/pglite';
import { COOKIE, MAX_FAILURES_PER_IP, MAX_FAILURES_TOTAL, checkPassword, createLoginLimiter, isSignedIn, sessionCookie } from './auth.js';
import { SCHEMA } from './schema.js';

process.env.SITE_PASSWORD = 'correct-horse-battery-staple';

const cookieValue = setCookie => setCookie.split(';')[0];
const reqWith = (cookie, extra = {}) => Object.assign(Readable.from([]), { method: 'GET', url: '/', headers: { cookie }, ...extra });
function fakeRes() {
  return { statusCode: 0, headers: {}, body: '', setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(b = '') { this.body = b; } };
}

test('only the exact password is accepted', () => {
  assert.equal(checkPassword('correct-horse-battery-staple'), true);
  assert.equal(checkPassword(' correct-horse-battery-staple\n'), true, 'pasted with whitespace');
  assert.equal(checkPassword('correct-horse-battery-stapl'), false);
  assert.equal(checkPassword(''), false);
  assert.equal(checkPassword(undefined), false);
});

test('a missing or short SITE_PASSWORD lets nobody in', () => {
  const saved = process.env.SITE_PASSWORD;
  try {
    process.env.SITE_PASSWORD = 'short';
    assert.throws(() => checkPassword('short'));
    delete process.env.SITE_PASSWORD;
    assert.throws(() => checkPassword(''));
  } finally {
    process.env.SITE_PASSWORD = saved;
  }
});

test('the session cookie is HttpOnly, Secure, SameSite=Strict and signs you in', () => {
  const set = sessionCookie();
  assert.match(set, /; HttpOnly; Secure; SameSite=Strict$/);
  assert.equal(isSignedIn(reqWith(cookieValue(set))), true);
  assert.equal(isSignedIn(reqWith(`other=1; ${cookieValue(set)}`)), true);
  assert.equal(isSignedIn(reqWith(undefined)), false);
});

test('a tampered, expired, or old-password cookie is refused', () => {
  const value = cookieValue(sessionCookie());
  const [, expiry, sig] = /=(\d+)\.(.+)$/.exec(value);
  assert.equal(isSignedIn(reqWith(`${COOKIE}=${Number(expiry) + 999}.${sig}`)), false, 'extended expiry');
  assert.equal(isSignedIn(reqWith(`${COOKIE}=${expiry}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`)), false, 'changed signature');

  const old = cookieValue(sessionCookie(Date.now() - 8 * 24 * 60 * 60 * 1000));
  assert.equal(isSignedIn(reqWith(old)), false, 'expired');

  const saved = process.env.SITE_PASSWORD;
  try {
    process.env.SITE_PASSWORD = 'a-completely-new-password';
    assert.equal(isSignedIn(reqWith(value)), false, 'password changed');
  } finally {
    process.env.SITE_PASSWORD = saved;
  }
});

test('wrong passwords lock out one address, and too many overall pause all sign-ins', async () => {
  const db = new PGlite();
  const query = async (text, params) => (await db.query(text, params)).rows;
  for (const statement of SCHEMA) await query(statement);
  const limiter = createLoginLimiter(query);

  for (let i = 0; i < MAX_FAILURES_PER_IP; i++) {
    assert.equal(await limiter.blocked('1.1.1.1'), null);
    await limiter.recordFailure('1.1.1.1');
  }
  assert.equal(await limiter.blocked('1.1.1.1'), 'ip');
  assert.equal(await limiter.blocked('2.2.2.2'), null, 'other addresses are unaffected');

  // Old failures stop counting.
  await query(`update login_failures set at = now() - interval '16 minutes'`);
  assert.equal(await limiter.blocked('1.1.1.1'), null);

  await query(`insert into login_failures (ip) select 'x' || g from generate_series(1, $1::int) g`, [MAX_FAILURES_TOTAL]);
  assert.equal(await limiter.blocked('3.3.3.3'), 'site');

  // Failures older than a day are deleted when a new one is recorded.
  await query(`update login_failures set at = now() - interval '2 days'`);
  await limiter.recordFailure('4.4.4.4');
  assert.deepEqual(await query(`select ip from login_failures`), [{ ip: '4.4.4.4' }]);
});

test('routes refuse visitors who are not signed in', async () => {
  const { default: data } = await import('../data.js');
  const { default: exportCsv } = await import('../export.js');
  const { default: page } = await import('../page.js');

  for (const [route, req] of [
    [data, reqWith(undefined)],
    [data, reqWith(undefined, { method: 'POST', headers: { 'content-type': 'application/json' } })],
    [exportCsv, reqWith(undefined)],
    [page, reqWith(undefined, { url: '/api/page?f=app' })],
  ]) {
    const res = fakeRes();
    await route(req, res);
    assert.equal(res.statusCode, 401, req.url);
    assert.equal(res.headers['x-frame-options'], 'DENY');
  }

  const res = fakeRes();
  await page(reqWith(undefined, { url: '/api/page?f=index' }), res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, '/login');

  const login = fakeRes();
  await page(reqWith(undefined, { url: '/api/page?f=login&error=<script>' }), login);
  assert.equal(login.statusCode, 200);
  assert.doesNotMatch(login.body, /<script>|<!--error-->/);

  const signedIn = fakeRes();
  await page(reqWith(cookieValue(sessionCookie()), { url: '/api/page?f=index' }), signedIn);
  assert.equal(signedIn.statusCode, 200);
  assert.match(signedIn.body, /Sign out/);
});
