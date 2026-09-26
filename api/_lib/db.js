// The connection to Neon, from DATABASE_URL (Vercel env vars on the site,
// `.env` locally).
import { neon } from '@neondatabase/serverless';
import { createLoginLimiter } from './auth.js';
import { createStore } from './store.js';

let query;

function getQuery() {
  if (!query) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set. See .env.example.');
    const sql = neon(url);
    query = (text, params) => sql.query(text, params);
  }
  return query;
}

export const getStore = () => createStore(getQuery());
export const getLoginLimiter = () => createLoginLimiter(getQuery());
