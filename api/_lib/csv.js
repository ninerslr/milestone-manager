// The CSV format: one row per assignment, header Project,Milestone,Employee.
// A row with an empty Milestone is a project with no milestones yet; a row
// with an empty Employee is a milestone with nobody assigned yet.

export const HEADER = ['Project', 'Milestone', 'Employee'];

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim()));
}

// Loads CSV text into an empty database through the store.
export async function loadCsv(store, text) {
  const [header, ...data] = parseCsv(text);
  if (!header || header.map(h => h.trim()).join(',') !== HEADER.join(',')) {
    throw new Error(`The CSV must start with the header ${HEADER.join(',')}`);
  }
  const projects = new Map(), milestones = new Map();
  for (const [project, milestone = '', employee = ''] of data.map(r => r.map(f => f.trim()))) {
    if (!project) continue;
    const pKey = project.toLowerCase();
    if (!projects.has(pKey)) projects.set(pKey, await store.apply({ op: 'addProject', name: project }));
    if (!milestone) continue;
    const mKey = `${pKey}\n${milestone.toLowerCase()}`;
    if (!milestones.has(mKey)) milestones.set(mKey, await store.apply({ op: 'addMilestone', projectId: projects.get(pKey), name: milestone }));
    if (employee) await store.apply({ op: 'assign', milestoneId: milestones.get(mKey), name: employee });
  }
}

// A cell starting with = + - @ (or tab/CR) is run as a formula by Excel and
// Sheets, e.g. =HYPERLINK(...). A leading apostrophe makes it plain text.
const neutralize = v => /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
const csvField = raw => {
  const v = neutralize(raw);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

// `state` is what store.getState() returns. Resources with no assignments
// have no row to live on, so they are not in the CSV.
export function toCsv({ projects, milestones, employees, assignments }) {
  const empName = new Map(employees.map(e => [e.id, e.name]));
  const lines = [HEADER];
  for (const p of projects) {
    const ms = milestones.filter(m => m.projectId === p.id);
    if (!ms.length) lines.push([p.name, '', '']);
    for (const m of ms) {
      const names = assignments.filter(a => a.milestoneId === m.id).map(a => empName.get(a.employeeId)).sort((a, b) => a.localeCompare(b));
      if (names.length) names.forEach(n => lines.push([p.name, m.name, n]));
      else lines.push([p.name, m.name, '']);
    }
  }
  return lines.map(l => l.map(csvField).join(',')).join('\r\n') + '\r\n';
}
