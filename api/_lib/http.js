// Shared request/response helpers for the API routes. Plain Node request and
// response objects, so the same routes run on Vercel and in scripts/dev-server.js.
import { HttpError } from './store.js';

const MAX_BODY_BYTES = 4096;

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

// Requiring application/json also stops a plain HTML form on another site
// from posting edits: forms cannot send that content type.
export async function readJson(req) {
  if (!/^application\/json(;|$)/i.test(String(req.headers['content-type'] ?? ''))) {
    throw new HttpError(415, 'Send JSON.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large.');
    chunks.push(buf);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Not valid JSON.');
  }
}

// Turns { METHOD: handler } into one route. HttpErrors become JSON answers;
// anything else is a bug and is left to fail as a 500.
export function route(handlers) {
  return async (req, res) => {
    const handler = handlers[req.method ?? ''];
    try {
      if (!handler) throw new HttpError(405, 'Method not allowed.');
      await handler(req, res);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      sendJson(res, err.status, { error: err.message });
    }
  };
}
