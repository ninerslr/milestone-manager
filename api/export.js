// GET /api/export -> the saved data as assignments.csv (Project,Milestone,Employee).
import { toCsv } from './_lib/csv.js';
import { getStore } from './_lib/db.js';
import { route } from './_lib/http.js';

export default route({
  async GET(_req, res) {
    const csv = toCsv(await getStore().getState());
    res.statusCode = 200;
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="assignments.csv"');
    res.setHeader('cache-control', 'no-store');
    res.end(csv);
  },
});
