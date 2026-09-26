// Shared request/response helpers for the API routes. Plain Node request and
// response objects, so the same routes run on Vercel and in scripts/dev-server.js.
import { isSignedIn } from './auth.js';
import { HttpError } from './store.js';

const MAX_BODY_BYTES = 4096;

// Sent with every response. The CSP allows only our own scripts; inline
// styles are allowed because the pages use style="" attributes.
export function securityHeaders(res) {
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-robots-tag', 'noindex, nofollow');
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

export function redirect(res, location, cookie) {
  res.statusCode = 303;
  res.setHeader('location', location);
  res.setHeader('cache-control', 'no-store');
  if (cookie) res.setHeader('set-cookie', cookie);
  res.end();
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large.');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Requiring application/json also stops a plain HTML form on another site
// from posting edits: forms cannot send that content type.
export async function readJson(req) {
  if (!/^application\/json(;|$)/i.test(String(req.headers['content-type'] ?? ''))) {
    throw new HttpError(415, 'Send JSON.');
  }
  try {
    return JSON.parse(await readBody(req));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Not valid JSON.');
  }
}

// The login form is a plain HTML form (no page script needed).
export async function readForm(req) {
  if (!/^application\/x-www-form-urlencoded(;|$)/i.test(String(req.headers['content-type'] ?? ''))) {
    throw new HttpError(415, 'Send a form.');
  }
  return new URLSearchParams(await readBody(req));
}

// Turns { METHOD: handler } into one route. Every route needs a signed-in
// session unless `{ public: true }`. HttpErrors become JSON answers;
// anything else is a bug and is left to fail as a 500.
export function route(handlers, { public: isPublic = false } = {}) {
  return async (req, res) => {
    securityHeaders(res);
    const handler = handlers[req.method ?? ''];
    try {
      if (!isPublic && !isSignedIn(req)) throw new HttpError(401, 'Please sign in.');
      if (!handler) throw new HttpError(405, 'Method not allowed.');
      await handler(req, res);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      sendJson(res, err.status, { error: err.message });
    }
  };
}
