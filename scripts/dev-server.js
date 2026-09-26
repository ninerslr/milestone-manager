// Local development server: npm run dev
//
// Same split Vercel uses in production:
//   /api/<name>  -> runs api/<name>.js
//   anything else -> a file from public/
// Needs DATABASE_URL in .env for the /api routes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function fail(res, code, message) {
  res.statusCode = code;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(message);
}

async function handle(req, res) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (pathname.startsWith('/api/')) {
    const name = pathname.slice('/api/'.length);
    // Simple names only, so /api/../.env can't escape the folder.
    if (!/^[a-z0-9-]+$/.test(name)) return fail(res, 404, 'Not found');
    let mod;
    try {
      mod = await import(new URL(`../api/${name}.js`, import.meta.url).href);
    } catch (err) {
      if (err.code === 'ERR_MODULE_NOT_FOUND') return fail(res, 404, `No API route named "${name}"`);
      throw err;
    }
    return mod.default(req, res);
  }

  const safe = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  if (safe.startsWith('..')) return fail(res, 404, 'Not found');
  const file = join(PUBLIC, safe);
  try {
    const body = await readFile(file);
    res.statusCode = 200;
    res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    fail(res, 404, 'Not found');
  }
}

createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    fail(res, 500, 'Something went wrong');
  });
}).listen(PORT, () => console.log(`Milestone Manager running at http://localhost:${PORT}`));
