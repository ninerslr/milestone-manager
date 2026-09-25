// The connection to Neon, from DATABASE_URL (Vercel env vars on the site,
// `.env` locally).
import { neon } from '@neondatabase/serverless';
import { createStore } from './store.js';

let store;

export function getStore() {
  if (!store) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
    const sql = neon(url);
    store = createStore((text, params) => sql.query(text, params));
  }
  return store;
}
