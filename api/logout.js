// POST /api/logout -> clears the session cookie, back to /login.
import { clearedCookie } from './_lib/auth.js';
import { redirect, route } from './_lib/http.js';

export default route({
  async POST(_req, res) {
    redirect(res, '/login', clearedCookie());
  },
}, { public: true });
