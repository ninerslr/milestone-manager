// Data is saved in a Neon Postgres database through /api/data.
// This page is only served to signed-in visitors (see api/page.js).
// Milestones belong to a project. There is no shared milestone list.
// Every edit is sent to the server, which answers with the fresh data, so
// the page also picks up changes other people have made.
const API = '/api/data';

const state = {
  tab: 'projects',         // 'projects' (By Project) or 'resources' (By Resource)
  selectedProjectId: null,
  selectedEmployeeId: null,
  projects: [],    // { id, name }
  milestones: [],  // { id, projectId, name }
  employees: [],   // { id, name }, sorted by name
  assignments: [], // { milestoneId, employeeId }  many-to-many: employee <-> milestone
};

// ---- Model ----
const byId = (arr, id) => arr.find(x => x.id === Number(id));
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const findProject = name => state.projects.find(p => sameName(p.name, name));
const findMilestone = (projectId, name) => milestonesFor(projectId).find(m => sameName(m.name, name));
const milestonesFor = projectId => state.milestones.filter(m => m.projectId === Number(projectId));
const findEmployee = name => state.employees.find(e => sameName(e.name, name));
const isAssigned = (milestoneId, employeeId) => state.assignments.some(a => a.milestoneId === Number(milestoneId) && a.employeeId === Number(employeeId));
const milestonesForEmployee = employeeId => state.assignments.filter(a => a.employeeId === Number(employeeId)).map(a => byId(state.milestones, a.milestoneId));
const empsFor = milestoneId => state.assignments.filter(a => a.milestoneId === Number(milestoneId)).map(a => byId(state.employees, a.employeeId));

// Takes the server's data, keeping the current selections if they still exist.
function setData(data) {
  Object.assign(state, data);
  if (!byId(state.projects, state.selectedProjectId)) state.selectedProjectId = state.projects[0] ? state.projects[0].id : null;
  if (!byId(state.employees, state.selectedEmployeeId)) state.selectedEmployeeId = state.employees[0] ? state.employees[0].id : null;
}

let saving = 0;
function showSaving() {
  document.getElementById('status').textContent = saving ? 'Saving…' : 'All changes saved';
}

// Sends one edit and redraws with the answer. Returns the id the server
// created or changed, or null if the edit was refused (the reason is shown).
async function send(edit, focusId) {
  saving++; showSaving();
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(edit) });
    if (res.status === 401) return signIn();
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(body.error || `Could not save (HTTP ${res.status}).`);
      await reload();
      return null;
    }
    setData(body.state);
    return body.id;
  } finally {
    saving--; showSaving();
    render(focusId);
  }
}

// The session has expired (or the password changed): back to the login page.
function signIn() {
  location.href = '/login';
  return null;
}

async function reload() {
  const res = await fetch(API);
  if (res.status === 401) return signIn();
  if (!res.ok) throw new Error(`Could not load the data (HTTP ${res.status}).`);
  setData((await res.json()).state);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- Views ----
function viewProjects() {
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

function viewResources() {
  const emp = byId(state.employees, state.selectedEmployeeId);
  return `
  <div class="layout">
    <div class="box">
      <h2>Resources</h2>
      ${state.employees.map(e => `
        <div class="list-item ${emp && e.id === emp.id ? 'active' : ''}" data-action="pick-employee" data-id="${e.id}">
          ${esc(e.name)}<small>${milestonesForEmployee(e.id).length} milestones</small>
        </div>`).join('') || '<p class="placeholder">No resources yet.</p>'}
      <div class="add-row">
        <input id="new-employee" placeholder="New resource name" data-enter="add-employee">
        <button class="btn primary" data-action="add-employee">+ Resource</button>
      </div>
    </div>
    <div class="box">
      ${emp ? viewResource(emp) : '<p class="placeholder">Add a resource on the left to get started.</p>'}
    </div>
  </div>`;
}

function viewResource(emp) {
  const count = milestonesForEmployee(emp.id).length;
  return `
    <div class="card-head">
      <h2 style="flex:1;display:flex;margin:0"><input class="name-input" value="${esc(emp.name)}" data-action="rename-employee" data-id="${emp.id}" title="Click to rename"></h2>
      <button class="btn danger" data-action="delete-employee" data-id="${emp.id}">Delete resource</button>
    </div>
    <div class="meta"><span>Assigned to ${count} milestone${count === 1 ? '' : 's'}</span>
      ${count ? '' : '<span>Not in the CSV export until assigned to at least one milestone</span>'}</div>
    <p class="placeholder">Tick every milestone this person works on, across any project.</p>
    ${state.projects.map(p => {
      const ms = milestonesFor(p.id);
      const n = ms.filter(m => isAssigned(m.id, emp.id)).length;
      return `
      <div class="project-group">
        <h3><span>${esc(p.name)}</span><span class="meta" style="margin:0">${n} of ${ms.length}</span></h3>
        ${ms.map(m => {
          const others = empsFor(m.id).filter(e => e !== emp).map(e => esc(e.name));
          return `
          <label class="check-row">
            <input type="checkbox" data-action="toggle-assign" data-ms="${m.id}" data-emp="${emp.id}" ${isAssigned(m.id, emp.id) ? 'checked' : ''}>
            <span>${esc(m.name)}<small>${others.length ? 'Also: ' + others.join(', ') : 'No one else assigned'}</small></span>
          </label>`;
        }).join('') || '<p class="placeholder">No milestones on this project yet (add them under By Project).</p>'}
      </div>`;
    }).join('') || '<p class="placeholder">No projects yet.</p>'}`;
}

// ---- Render + events ----
function render(focusId) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  const view = state.tab === 'resources' ? viewResources : viewProjects;
  document.getElementById('app').innerHTML = view();
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}

const inputValue = id => (document.getElementById(id).value || '').trim();

async function act(t) {
  const a = t.dataset.action, pid = state.selectedProjectId;
  if (a === 'pick-project') state.selectedProjectId = Number(t.dataset.id);
  else if (a === 'add-project') {
    const name = inputValue('new-project');
    if (!name) return;
    if (findProject(name)) return alert(`A project named "${name}" already exists.`);
    const id = await send({ op: 'addProject', name });
    if (id) { state.selectedProjectId = id; render('new-milestone'); }
    return;
  } else if (a === 'delete-project') {
    const p = byId(state.projects, t.dataset.id);
    if (!confirm(`Delete "${p.name}" and all its milestones?`)) return;
    return send({ op: 'deleteProject', id: p.id });
  } else if (a === 'add-milestone') {
    const name = inputValue('new-milestone');
    if (!name) return;
    if (findMilestone(pid, name)) return alert(`This project already has a "${name}" milestone.`);
    return send({ op: 'addMilestone', projectId: pid, name }, 'new-milestone');
  } else if (a === 'delete-milestone') return send({ op: 'deleteMilestone', id: Number(t.dataset.id) });
  else if (a === 'assign') {
    const name = inputValue(`assign-${t.dataset.ms}`);
    if (!name) return;
    return send({ op: 'assign', milestoneId: Number(t.dataset.ms), name }, `assign-${t.dataset.ms}`);
  } else if (a === 'unassign') return send({ op: 'unassign', milestoneId: Number(t.dataset.ms), employeeId: Number(t.dataset.emp) });
  else if (a === 'pick-employee') state.selectedEmployeeId = Number(t.dataset.id);
  else if (a === 'add-employee') {
    const name = inputValue('new-employee');
    if (!name) return;
    if (findEmployee(name)) return alert(`A resource named "${name}" already exists.`);
    const id = await send({ op: 'addEmployee', name });
    if (id) { state.selectedEmployeeId = id; render(); }
    return;
  } else if (a === 'delete-employee') {
    const e = byId(state.employees, t.dataset.id);
    if (!confirm(`Delete "${e.name}" and remove them from all milestones?`)) return;
    return send({ op: 'deleteEmployee', id: e.id });
  } else return;
  render();
}

// Checks the name locally first so an obvious clash doesn't need a round trip;
// the server checks again, since someone else may have taken the name.
function rename(t) {
  const name = t.value.trim(), id = Number(t.dataset.id);
  const kinds = {
    'rename-project': { list: state.projects, find: findProject, op: 'renameProject', clash: `A project named "${name}" already exists.` },
    'rename-employee': { list: state.employees, find: findEmployee, op: 'renameEmployee', clash: `A resource named "${name}" already exists.` },
    'rename-milestone': { list: state.milestones, find: n => findMilestone(byId(state.milestones, id).projectId, n), op: 'renameMilestone', clash: `This project already has a "${name}" milestone.` },
  };
  const k = kinds[t.dataset.action], item = byId(k.list, id), other = k.find(name);
  if (!name || name === item.name) return render();
  if (other && other !== item) { alert(k.clash); return render(); }
  send({ op: k.op, id, name });
}

const app = document.getElementById('app');
app.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (t && t.tagName !== 'INPUT') act(t);
});
app.addEventListener('change', e => {
  const t = e.target;
  if (/^rename-/.test(t.dataset.action || '')) rename(t);
  else if (t.dataset.action === 'toggle-assign') {
    const milestoneId = Number(t.dataset.ms), emp = byId(state.employees, t.dataset.emp);
    send(t.checked ? { op: 'assign', milestoneId, name: emp.name } : { op: 'unassign', milestoneId, employeeId: emp.id });
  }
});
document.getElementById('nav').addEventListener('click', e => {
  if (e.target.dataset.tab) { state.tab = e.target.dataset.tab; render(); }
});
app.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (t.dataset.enter) act({ dataset: { ...t.dataset, action: t.dataset.enter } });
  else if (/^rename-/.test(t.dataset.action || '')) t.blur();
});

reload()
  .then(() => { showSaving(); render(); })
  .catch(err => {
    app.innerHTML = `<div class="box"><h2>Could not load data</h2><p>${esc(err.message)}</p></div>`;
  });
