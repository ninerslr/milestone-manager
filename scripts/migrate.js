// Creates the tables, and fills an empty database from data/assignments.csv.
//
//   npm run db:migrate
//
// Reads DATABASE_URL from .env. Safe to run as often as you like: the tables
// are only created if missing, and the CSV is only loaded when there are no
// projects yet.
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { loadCsv } from '../api/_lib/csv.js';
import { SCHEMA } from '../api/_lib/schema.js';
import { createStore } from '../api/_lib/store.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Put it in .env - see .env.example.');
  process.exit(1);
}

const sql = neon(url);
const query = (text, params) => sql.query(text, params);
for (const statement of SCHEMA) await query(statement);

const [{ count }] = await query('select count(*)::int as count from projects');
if (count === 0) {
  const text = await readFile(new URL('../data/assignments.csv', import.meta.url), 'utf8');
  await loadCsv(createStore(query), text);
  console.log('Tables created and loaded from data/assignments.csv.');
} else {
  console.log(`Tables are up to date. ${count} project(s) already saved, so the CSV was not loaded.`);
}
