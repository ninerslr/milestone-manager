// The shared-password login.
//
// - The password is SITE_PASSWORD (Doppler + Vercel env vars).
// - A correct password gets a session cookie: "<expiry>.<signature>", signed
//   with the password itself. Changing SITE_PASSWORD therefore signs
//   everyone out, and there is no session table to clean up.
// - Wrong passwords are recorded per IP address. After MAX_FAILURES_PER_IP in
//   FAILURE_WINDOW, that address is refused until the window passes. If the
//   whole site sees MAX_FAILURES_TOTAL in the window, every login is refused
//   for a while: people already signed in are not affected, and it caps how
//   many rows an attack can write.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'mm_session';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const MIN_PASSWORD_LENGTH = 16;
export const FAILURE_WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_IP = 5;
export const MAX_FAILURES_TOTAL = 200;

function password() {
  const p = process.env.SITE_PASSWORD ?? '';
  // Fail closed: no password configured means nobody gets in.
  if (p.length < MIN_PASSWORD_LENGTH) throw new Error(`SITE_PASSWORD must be set and at least ${MIN_PASSWORD_LENGTH} characters.`);
  return p;
}

const sign = (expiry, key) => createHmac('sha256', key).update(`session:${expiry}`).digest('base64url');

// Compares hashes, so the comparison takes the same time whatever is typed.
function same(a, b) {
  const h = s => createHash('sha256').update(s).digest();
  return timingSafeEqual(h(a), h(b));
}

// Leading/trailing whitespace is ignored: a pasted password often carries some.
export function checkPassword(attempt) {
  return typeof attempt === 'string' && same(attempt.trim(), password().trim());
}

export function sessionCookie(now = Date.now()) {
  const expiry = Math.floor(now / 1000) + SESSION_SECONDS;
  return `${COOKIE}=${expiry}.${sign(expiry, password())}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export const clearedCookie = () => `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`;

export function isSignedIn(req, now = Date.now()) {
  const value = String(req.headers.cookie ?? '').split(';').map(s => s.trim())
    .find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? '';
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return false;
  const expiry = Number(match[1]);
  return expiry > now / 1000 && same(match[2], sign(expiry, password()));
}

// On Vercel the client address is the first x-forwarded-for entry, which
// Vercel sets itself; locally it is the socket address.
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return (forwarded || req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

// `query(text, params) -> rows`, as in store.js.
export function createLoginLimiter(query) {
  const window = `${FAILURE_WINDOW_MINUTES} minutes`;
  return {
    // Why logins from this address are refused right now, or null.
    async blocked(ip) {
      const [{ mine, total }] = await query(
        `select count(*) filter (where ip = $1)::int as mine, count(*)::int as total
         from login_failures where at > now() - $2::interval`,
        [ip, window],
      );
      if (mine >= MAX_FAILURES_PER_IP) return 'ip';
      if (total >= MAX_FAILURES_TOTAL) return 'site';
      return null;
    },
    async recordFailure(ip) {
      await query(`insert into login_failures (ip) values ($1)`, [ip]);
      await query(`delete from login_failures where at < now() - interval '1 day'`);
    },
  };
}
