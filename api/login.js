// POST /api/login   form field "password" -> session cookie, back to /
// POST /api/logout is api/logout.js.
// Every answer is a redirect, so the plain HTML form on /login needs no script.
import { checkPassword, clientIp, sessionCookie } from './_lib/auth.js';
import { getLoginLimiter } from './_lib/db.js';
import { readForm, redirect, route } from './_lib/http.js';

export default route({
  async POST(req, res) {
    const limiter = getLoginLimiter(), ip = clientIp(req);
    const blocked = await limiter.blocked(ip);
    if (blocked) return redirect(res, `/login?error=${blocked === 'ip' ? 'locked' : 'busy'}`);

    const form = await readForm(req);
    if (!checkPassword(form.get('password') ?? '')) {
      await limiter.recordFailure(ip);
      return redirect(res, '/login?error=wrong');
    }
    redirect(res, '/', sessionCookie());
  },
}, { public: true });
