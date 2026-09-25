// GET  /api/data  -> all projects, milestones, employees and assignments
// POST /api/data  -> apply one edit, e.g. { "op": "renameMilestone", "id": 3, "name": "FAT" }
//                    answers { id, state } with the fresh data, so the page
//                    also picks up anyone else's changes.
import { getStore } from './_lib/db.js';
import { readJson, route, sendJson } from './_lib/http.js';

export default route({
  async GET(_req, res) {
    sendJson(res, 200, { state: await getStore().getState() });
  },
  async POST(req, res) {
    const store = getStore();
    const id = await store.apply(await readJson(req));
    sendJson(res, 200, { id, state: await store.getState() });
  },
});
