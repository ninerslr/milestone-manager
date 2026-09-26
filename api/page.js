// Serves the site's pages, so the main page and its script are only sent to
// signed-in visitors (see the rewrites in vercel.json):
//   /        -> site/index.html   (signed in, else redirect to /login)
//   /app.js  -> site/app.js       (signed in)
//   /login   -> site/login.html   (anyone)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FAILURE_WINDOW_MINUTES, isSignedIn } from './_lib/auth.js';
import { redirect, route } from './_lib/http.js';
import { HttpError } from './_lib/store.js';

const PAGES = {
  index: { file: 'index.html', type: 'text/html; charset=utf-8', signedIn: true },
  app: { file: 'app.js', type: 'text/javascript; charset=utf-8', signedIn: true },
  login: { file: 'login.html', type: 'text/html; charset=utf-8', signedIn: false },
};

const LOGIN_ERRORS = {
  wrong: 'Wrong password.',
  locked: `Too many wrong passwords. Try again in ${FAILURE_WINDOW_MINUTES} minutes.`,
  busy: 'Sign-in is paused because of too many failed attempts. Try again later.',
};

export default route({
  async GET(req, res) {
    const f = new URL(req.url ?? '/', 'http://x').searchParams.get('f') ?? '';
    const page = Object.hasOwn(PAGES, f) ? PAGES[f] : null;
    if (!page) throw new HttpError(404, 'Not found.');
    if (page.signedIn && !isSignedIn(req)) {
      if (f === 'index') return redirect(res, '/login');
      throw new HttpError(401, 'Please sign in.');
    }
    // Already signed in: skip the login page.
    if (f === 'login' && isSignedIn(req)) return redirect(res, '/');

    let body = await readFile(join(process.cwd(), 'site', page.file), 'utf8');
    if (f === 'login') {
      // Only these fixed messages are ever put in the page, never the query text.
      const error = new URL(req.url ?? '/', 'http://x').searchParams.get('error');
      body = body.replace('<!--error-->', Object.hasOwn(LOGIN_ERRORS, error) ? `<p class="error">${LOGIN_ERRORS[error]}</p>` : '');
    }
    res.statusCode = 200;
    res.setHeader('content-type', page.type);
    res.setHeader('cache-control', 'no-store');
    res.end(body);
  },
}, { public: true });
