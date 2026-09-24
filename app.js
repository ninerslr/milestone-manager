// Data comes from the flat file data/assignments.csv (Project,Milestone,Employee).
// Milestones belong to a project. There is no shared milestone list.
// A row with an empty Milestone is a project with no milestones yet;
// a row with an empty Employee is a milestone with nobody assigned yet.
// Edits live in memory only. "Download CSV" exports them in the same format.
const DATA_FILE = 'data/assignments.csv';

const state = {
  selectedProjectId: null,
  projects: [],    // { id, name }
  milestones: [],  // { id, projectId, name }
  employees: [],   // { id, name }
  assignments: [], // { milestoneId, employeeId }  many-to-many: employee <-> milestone
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
  for (const p of state.projects) {
    const ms = milestonesFor(p.id);
    if (!ms.length) lines.push([p.name, '', '']);
    for (const m of ms) {
      const emps = empsFor(m.id);
      if (emps.length) emps.forEach(e => lines.push([p.name, m.name, e.name]));
      else lines.push([p.name, m.name, '']);
    }
  }
  return lines.map(l => l.map(csvField).join(',')).join('\r\n') + '\r\n';
}

function loadRows(rows) {
  const [header, ...data] = rows;
  if (header.map(h => h.trim()).join(',') !== 'Project,Milestone,Employee') {
    throw new Error(`${DATA_FILE} must start with the header Project,Milestone,Employee`);
  }
  for (const [project, milestone = '', employee = ''] of data.map(r => r.map(f => f.trim()))) {
    if (!project) continue;
    const p = findProject(project) || addProject(project);
    if (!milestone) continue;
    const m = findMilestone(p.id, milestone) || addMilestone(p.id, milestone);
    if (employee) assign(m.id, employee);
  }
  state.selectedProjectId = state.projects[0] && state.projects[0].id;
}

// ---- Model ----
const byId = (arr, id) => arr.find(x => x.id === id);
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const findProject = name => state.projects.find(p => sameName(p.name, name));
const findMilestone = (projectId, name) => milestonesFor(projectId).find(m => sameName(m.name, name));
const milestonesFor = projectId => state.milestones.filter(m => m.projectId === projectId);
const empsFor = milestoneId => state.assignments.filter(a => a.milestoneId === milestoneId).map(a => byId(state.employees, a.employeeId));

function addProject(name) {
  const p = { id: uid('p'), name };
  state.projects.push(p);
  return p;
}
function addMilestone(projectId, name) {
  const m = { id: uid('m'), projectId, name };
  state.milestones.push(m);
  return m;
}
function assign(milestoneId, employeeName) {
  let e = state.employees.find(x => sameName(x.name, employeeName));
  if (!e) {
    e = { id: uid('e'), name: employeeName };
    state.employees.push(e);
    state.employees.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!state.assignments.some(a => a.milestoneId === milestoneId && a.employeeId === e.id)) {
    state.assignments.push({ milestoneId, employeeId: e.id });
  }
}
function removeMilestone(id) {
  state.milestones = state.milestones.filter(m => m.id !== id);
  state.assignments = state.assignments.filter(a => a.milestoneId !== id);
}
function removeProject(id) {
  milestonesFor(id).forEach(m => removeMilestone(m.id));
  state.projects = state.projects.filter(p => p.id !== id);
  if (state.selectedProjectId === id) state.selectedProjectId = state.projects[0] && state.projects[0].id;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- View ----
function view() {
  const project = byId(state.projects, state.selectedProjectId);
  return `
  <div class="layout">
    <div class="box">
      <h2>Projects</h2>
      ${state.projects.map(p => `
        <div class="list-item ${project && p.id === project.id ? 'active' : ''}" data-action="pick-project" data-id="${p.id}">
          ${esc(p.name)}<small>${milestonesFor(p.id).length} milestones</small>
        </div>`).join('') || '<p class="placeholder">No projects yet.</p>'}
      <div class="add-row">
        <input id="new-project" placeholder="New project name" data-enter="add-project">
        <button class="btn primary" data-action="add-project">+ Project</button>
      </div>
    </div>
    <div class="box">
      ${project ? viewProject(project) : '<p class="placeholder">Create a project on the left to get started.</p>'}
    </div>
  </div>`;
}

function viewProject(project) {
  const ms = milestonesFor(project.id);
  return `
    <div class="card-head">
      <h2 style="flex:1;display:flex;margin:0"><input class="name-input" value="${esc(project.name)}" data-action="rename-project" data-id="${project.id}" title="Click to rename"></h2>
      <button class="btn danger" data-action="delete-project" data-id="${project.id}">Delete project</button>
    </div>
    <div class="meta"><span>${ms.length} milestones</span></div>
    ${ms.map(viewMilestone).join('') || '<p class="placeholder">No milestones yet. Add the first one below.</p>'}
    <div class="add-row">
      <input id="new-milestone" placeholder="New milestone name, e.g. Travel Time" data-enter="add-milestone">
      <button class="btn primary" data-action="add-milestone">+ Milestone</button>
    </div>`;
}

function viewMilestone(m) {
  const assigned = empsFor(m.id);
  const available = state.employees.filter(e => !assigned.includes(e));
  return `
  <div class="card">
    <div class="card-head">
      <input class="name-input" value="${esc(m.name)}" data-action="rename-milestone" data-id="${m.id}" title="Click to rename">
      <span class="meta" style="margin:0">${assigned.length} assigned</span>
      <button class="btn danger" data-action="delete-milestone" data-id="${m.id}">Remove</button>
    </div>
    <div class="chips" style="margin-top:8px">
      ${assigned.map(e => `<span class="chip">${esc(e.name)}<button title="Unassign" data-action="unassign" data-ms="${m.id}" data-emp="${e.id}">×</button></span>`).join('')
        || '<span class="placeholder">No one assigned</span>'}
    </div>
    <div class="add-row">
      <input id="assign-${m.id}" list="emps-${m.id}" placeholder="Employee name (pick or type a new one)" data-enter="assign" data-ms="${m.id}">
      <datalist id="emps-${m.id}">${available.map(e => `<option value="${esc(e.name)}">`).join('')}</datalist>
      <button class="btn" data-action="assign" data-ms="${m.id}">Assign</button>
    </div>
  </div>`;
}

// ---- Render + events ----
function render(focusId) {
  document.getElementById('app').innerHTML = view() +
    `<div class="note">Data loaded from ${DATA_FILE}. Changes stay in this browser until you reload. Use "Download CSV" to keep them.</div>`;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}

function downloadCsv() {
  const url = URL.createObjectURL(new Blob([toCsv()], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'assignments.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

const inputValue = id => (document.getElementById(id).value || '').trim();

function act(t) {
  const a = t.dataset.action, pid = state.selectedProjectId;
  if (a === 'pick-project') state.selectedProjectId = t.dataset.id;
  else if (a === 'add-project') {
    const name = inputValue('new-project');
    if (!name) return;
    if (findProject(name)) return alert(`A project named "${name}" already exists.`);
    state.selectedProjectId = addProject(name).id;
    return render('new-milestone');
  } else if (a === 'delete-project') {
    const p = byId(state.projects, t.dataset.id);
    if (!confirm(`Delete "${p.name}" and all its milestones?`)) return;
    removeProject(p.id);
  } else if (a === 'add-milestone') {
    const name = inputValue('new-milestone');
    if (!name) return;
    if (findMilestone(pid, name)) return alert(`This project already has a "${name}" milestone.`);
    addMilestone(pid, name);
    return render('new-milestone');
  } else if (a === 'delete-milestone') removeMilestone(t.dataset.id);
  else if (a === 'assign') {
    const name = inputValue(`assign-${t.dataset.ms}`);
    if (!name) return;
    assign(t.dataset.ms, name);
    return render(`assign-${t.dataset.ms}`);
  } else if (a === 'unassign') {
    state.assignments = state.assignments.filter(x => !(x.milestoneId === t.dataset.ms && x.employeeId === t.dataset.emp));
  } else return;
  render();
}

function rename(t) {
  const name = t.value.trim();
  if (t.dataset.action === 'rename-project') {
    const p = byId(state.projects, t.dataset.id), clash = findProject(name);
    if (name && (!clash || clash === p)) p.name = name;
    else if (name) alert(`A project named "${name}" already exists.`);
  } else {
    const m = byId(state.milestones, t.dataset.id), clash = findMilestone(m.projectId, name);
    if (name && (!clash || clash === m)) m.name = name;
    else if (name) alert(`This project already has a "${name}" milestone.`);
  }
  render();
}

const app = document.getElementById('app');
app.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (t && t.tagName !== 'INPUT') act(t);
});
app.addEventListener('change', e => {
  if (/^rename-/.test(e.target.dataset.action || '')) rename(e.target);
});
app.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (t.dataset.enter) act({ dataset: { ...t.dataset, action: t.dataset.enter } });
  else if (/^rename-/.test(t.dataset.action || '')) t.blur();
});
document.getElementById('download').addEventListener('click', downloadCsv);

fetch(DATA_FILE)
  .then(r => { if (!r.ok) throw new Error(`Could not load ${DATA_FILE} (HTTP ${r.status})`); return r.text(); })
  .then(text => { loadRows(parseCsv(text)); render(); })
  .catch(err => {
    app.innerHTML =
      `<div class="box"><h2>Could not load data</h2><p>${esc(err.message)}</p>
       <p class="placeholder">Opening index.html straight from disk blocks this. Run <code>npx serve .</code> in this folder instead.</p></div>`;
  });
