// Data comes from the flat file data/assignments.csv (Project,Milestone,Employee).
// A row with an empty Employee means the milestone is on the project with nobody assigned.
// Edits live in memory only. "Download CSV" exports them in the same format.
const DATA_FILE = 'data/assignments.csv';

const state = {
  tab: 'projects',
  selectedProjectId: null,
  selectedEmployeeId: null,
  projects: [],          // { id, name }
  milestones: [],        // { id, name }  shared list of milestone names
  employees: [],         // { id, name }
  projectMilestones: [], // { id, projectId, milestoneId }  a milestone selected for a project
  assignments: [],       // { pmId, employeeId }  many-to-many: employee <-> project milestone
};
let seq = 0;
const uid = p => p + (++seq);

// ---- CSV ----
function parseCsv(text) {
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

const csvField = v => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

function toCsv() {
  const lines = [['Project', 'Milestone', 'Employee']];
  for (const pm of state.projectMilestones) {
    const p = byId(state.projects, pm.projectId).name, m = byId(state.milestones, pm.milestoneId).name;
    const emps = empsFor(pm.id);
    if (emps.length) emps.forEach(e => lines.push([p, m, e.name]));
    else lines.push([p, m, '']);
  }
  return lines.map(l => l.map(csvField).join(',')).join('\r\n') + '\r\n';
}

function loadRows(rows) {
  const [header, ...data] = rows;
  if (header.map(h => h.trim()).join(',') !== 'Project,Milestone,Employee') {
    throw new Error(`${DATA_FILE} must start with the header Project,Milestone,Employee`);
  }
  const findOrAdd = (arr, prefix, name) =>
    arr.find(x => x.name === name) || (arr.push({ id: uid(prefix), name }), arr[arr.length - 1]);
  for (const [project, milestone, employee = ''] of data.map(r => r.map(f => f.trim()))) {
    const p = findOrAdd(state.projects, 'p', project);
    const m = findOrAdd(state.milestones, 'm', milestone);
    let pm = state.projectMilestones.find(x => x.projectId === p.id && x.milestoneId === m.id);
    if (!pm) { pm = { id: uid('pm'), projectId: p.id, milestoneId: m.id }; state.projectMilestones.push(pm); }
    if (employee) {
      const e = findOrAdd(state.employees, 'e', employee);
      if (!state.assignments.some(a => a.pmId === pm.id && a.employeeId === e.id)) {
        state.assignments.push({ pmId: pm.id, employeeId: e.id });
      }
    }
  }
  state.employees.sort((a, b) => a.name.localeCompare(b.name));
  state.selectedProjectId = state.projects[0] && state.projects[0].id;
  state.selectedEmployeeId = state.employees[0] && state.employees[0].id;
}

// ---- Lookups ----
const byId = (arr, id) => arr.find(x => x.id === id);
const pmsFor = projectId => state.projectMilestones.filter(pm => pm.projectId === projectId);
const empsFor = pmId => state.assignments.filter(a => a.pmId === pmId).map(a => byId(state.employees, a.employeeId));
const pmsForEmployee = empId => state.assignments.filter(a => a.employeeId === empId).map(a => byId(state.projectMilestones, a.pmId));
const pmLabel = pm => `${byId(state.projects, pm.projectId).name} › ${byId(state.milestones, pm.milestoneId).name}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- Views ----
function viewProjects() {
  const project = byId(state.projects, state.selectedProjectId);
  if (!project) return '<div class="box"><p class="placeholder">No projects in the data file.</p></div>';
  const selected = pmsFor(project.id);
  const selectedIds = new Set(selected.map(pm => pm.milestoneId));
  return `
  <div class="layout">
    <div class="box">
      <h2>Projects</h2>
      ${state.projects.map(p => `
        <div class="list-item ${p.id === project.id ? 'active' : ''}" data-action="pick-project" data-id="${p.id}">
          ${esc(p.name)}<small>${pmsFor(p.id).length} milestones</small>
        </div>`).join('')}
    </div>
    <div class="box">
      <h2>${esc(project.name)}</h2>
      <div class="meta"><span>${selected.length} milestones selected</span></div>
      <div class="cols">
        <div class="box">
          <h2>Select milestones</h2>
          ${state.milestones.map(m => `
            <label class="check-row">
              <input type="checkbox" data-action="toggle-milestone" data-id="${m.id}" ${selectedIds.has(m.id) ? 'checked' : ''}>
              <span>${esc(m.name)}</span>
            </label>`).join('')}
        </div>
        <div>
          ${selected.length ? selected.map(cardForPm).join('') : '<p class="placeholder">No milestones selected. Tick one on the left.</p>'}
        </div>
      </div>
    </div>
  </div>`;
}

function cardForPm(pm) {
  const m = byId(state.milestones, pm.milestoneId);
  const assigned = empsFor(pm.id);
  const available = state.employees.filter(e => !assigned.includes(e));
  return `
  <div class="card">
    <div class="card-head"><h3>${esc(m.name)}</h3><span class="meta">${assigned.length} assigned</span></div>
    <div class="chips">
      ${assigned.map(e => `<span class="chip">${esc(e.name)}<button title="Remove" data-action="unassign" data-pm="${pm.id}" data-emp="${e.id}">×</button></span>`).join('')
        || '<span class="placeholder">No one assigned</span>'}
      ${available.length ? `
        <select data-action="assign" data-pm="${pm.id}">
          <option value="">+ Assign employee…</option>
          ${available.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}
        </select>` : ''}
    </div>
  </div>`;
}

function viewEmployees() {
  const emp = byId(state.employees, state.selectedEmployeeId);
  if (!emp) return '<div class="box"><p class="placeholder">No employees in the data file.</p></div>';
  const pms = pmsForEmployee(emp.id);
  const unassigned = state.projectMilestones.filter(pm => !pms.includes(pm));
  return `
  <div class="layout">
    <div class="box">
      <h2>Employees</h2>
      ${state.employees.map(e => `
        <div class="list-item ${e.id === emp.id ? 'active' : ''}" data-action="pick-employee" data-id="${e.id}">
          ${esc(e.name)}<small>${pmsForEmployee(e.id).length} milestones</small>
        </div>`).join('')}
    </div>
    <div class="box">
      <h2>${esc(emp.name)}</h2>
      <div class="meta"><span>${pms.length} milestone associations</span></div>
      <table>
        <thead><tr><th>Project</th><th>Milestone</th><th>Also assigned</th><th></th></tr></thead>
        <tbody>
          ${pms.map(pm => `
            <tr>
              <td>${esc(byId(state.projects, pm.projectId).name)}</td>
              <td>${esc(byId(state.milestones, pm.milestoneId).name)}</td>
              <td>${empsFor(pm.id).filter(e => e !== emp).map(e => esc(e.name)).join(', ') || '<span class="placeholder">none</span>'}</td>
              <td><button class="btn" data-action="unassign" data-pm="${pm.id}" data-emp="${emp.id}">Remove</button></td>
            </tr>`).join('') || '<tr><td colspan="4" class="placeholder">No milestone associations.</td></tr>'}
        </tbody>
      </table>
      ${unassigned.length ? `
        <div class="row" style="margin-top:14px">
          <select id="emp-add">
            <option value="">+ Associate with a project milestone…</option>
            ${unassigned.map(pm => `<option value="${pm.id}">${esc(pmLabel(pm))}</option>`).join('')}
          </select>
          <button class="btn primary" data-action="emp-assign" data-emp="${emp.id}">Add</button>
        </div>` : ''}
    </div>
  </div>`;
}

function viewLibrary() {
  return `
  <div class="box">
    <h2>Milestone Library</h2>
    <p class="placeholder">Milestone names that projects select from.</p>
    <table>
      <thead><tr><th>Milestone</th><th>Used on projects</th></tr></thead>
      <tbody>
        ${state.milestones.map(m => {
          const used = state.projectMilestones.filter(pm => pm.milestoneId === m.id).map(pm => esc(byId(state.projects, pm.projectId).name));
          return `<tr><td>${esc(m.name)}</td><td>${used.join(', ') || '<span class="placeholder">unused (not saved in the CSV until a project selects it)</span>'}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="row" style="margin-top:14px">
      <input id="lib-name" placeholder="Milestone name">
      <button class="btn primary" data-action="lib-add">Add milestone</button>
    </div>
  </div>`;
}

// ---- Render + events ----
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  const view = { projects: viewProjects, employees: viewEmployees, library: viewLibrary }[state.tab];
  document.getElementById('app').innerHTML = view() +
    `<div class="note">Data loaded from ${DATA_FILE}. Changes stay in this browser until you reload. Use "Download CSV" to keep them.</div>`;
}

function downloadCsv() {
  const url = URL.createObjectURL(new Blob([toCsv()], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'assignments.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('nav').addEventListener('click', e => {
  if (e.target.dataset.tab) { state.tab = e.target.dataset.tab; render(); }
});
document.getElementById('download').addEventListener('click', downloadCsv);

document.getElementById('app').addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  if (a === 'pick-project') state.selectedProjectId = t.dataset.id;
  else if (a === 'pick-employee') state.selectedEmployeeId = t.dataset.id;
  else if (a === 'unassign') state.assignments = state.assignments.filter(x => !(x.pmId === t.dataset.pm && x.employeeId === t.dataset.emp));
  else if (a === 'emp-assign') {
    const pmId = document.getElementById('emp-add').value;
    if (!pmId) return;
    state.assignments.push({ pmId, employeeId: t.dataset.emp });
  } else if (a === 'lib-add') {
    const name = document.getElementById('lib-name').value.trim();
    if (!name || state.milestones.some(m => m.name === name)) return;
    state.milestones.push({ id: uid('m'), name });
  } else return;
  render();
});

document.getElementById('app').addEventListener('change', e => {
  const t = e.target, a = t.dataset.action;
  if (a === 'toggle-milestone') {
    const pid = state.selectedProjectId;
    if (t.checked) {
      state.projectMilestones.push({ id: uid('pm'), projectId: pid, milestoneId: t.dataset.id });
    } else {
      const pm = state.projectMilestones.find(x => x.projectId === pid && x.milestoneId === t.dataset.id);
      state.projectMilestones = state.projectMilestones.filter(x => x !== pm);
      state.assignments = state.assignments.filter(x => x.pmId !== pm.id);
    }
  } else if (a === 'assign' && t.value) state.assignments.push({ pmId: t.dataset.pm, employeeId: t.value });
  else return;
  render();
});

fetch(DATA_FILE)
  .then(r => { if (!r.ok) throw new Error(`Could not load ${DATA_FILE} (HTTP ${r.status})`); return r.text(); })
  .then(text => { loadRows(parseCsv(text)); render(); })
  .catch(err => {
    document.getElementById('app').innerHTML =
      `<div class="box"><h2>Could not load data</h2><p>${esc(err.message)}</p>
       <p class="placeholder">Opening index.html straight from disk blocks this. Run <code>npx serve .</code> in this folder instead.</p></div>`;
  });
