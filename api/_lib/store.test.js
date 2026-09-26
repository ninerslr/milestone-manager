// Runs the real schema and store against PGlite, a Postgres that lives inside
// the test process. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadCsv, parseCsv, toCsv } from './csv.js';
import { SCHEMA } from './schema.js';
import { LIMITS, createStore } from './store.js';

async function freshStore() {
  const db = new PGlite();
  const query = async (text, params) => (await db.query(text, params)).rows;
  for (const statement of SCHEMA) await query(statement);
  return createStore(query);
}

const rejects = (promise, status, message) =>
  assert.rejects(promise, err => err.status === status && (!message || err.message.includes(message)));

test('loading data/assignments.csv and exporting it gives the same rows back', async () => {
  const store = await freshStore();
  const text = await readFile(new URL('../../data/assignments.csv', import.meta.url), 'utf8');
  await loadCsv(store, text);

  const state = await store.getState();
  assert.equal(state.projects.length, 2);
  assert.equal(state.milestones.length, 7); // 5 distinct names; Travel Time and Project Support are on both projects
  assert.equal(state.employees.length, 11);
  assert.equal(state.assignments.length, 23);

  const sorted = rows => rows.map(r => r.join(',')).sort();
  assert.deepEqual(sorted(parseCsv(toCsv(state))), sorted(parseCsv(text)));
});

test('names must be unique ignoring case: projects, milestones within a project, employees', async () => {
  const store = await freshStore();
  const a = await store.apply({ op: 'addProject', name: 'Alpha' });
  const b = await store.apply({ op: 'addProject', name: 'Beta' });
  await rejects(store.apply({ op: 'addProject', name: 'alpha' }), 409, 'already exists');
  await rejects(store.apply({ op: 'renameProject', id: b, name: 'ALPHA' }), 409);

  await store.apply({ op: 'addMilestone', projectId: a, name: 'Travel Time' });
  await rejects(store.apply({ op: 'addMilestone', projectId: a, name: 'travel time' }), 409);
  // A different project can have its own milestone with the same name.
  await store.apply({ op: 'addMilestone', projectId: b, name: 'Travel Time' });

  await store.apply({ op: 'addEmployee', name: 'Ann' });
  await rejects(store.apply({ op: 'addEmployee', name: 'ann' }), 409);
});

test('assigning by name reuses an existing employee and ignores repeats', async () => {
  const store = await freshStore();
  const p = await store.apply({ op: 'addProject', name: 'P' });
  const m = await store.apply({ op: 'addMilestone', projectId: p, name: 'M' });
  const ann = await store.apply({ op: 'addEmployee', name: 'Ann' });

  assert.equal(await store.apply({ op: 'assign', milestoneId: m, name: 'ANN' }), ann);
  await store.apply({ op: 'assign', milestoneId: m, name: 'Ann' });
  const bob = await store.apply({ op: 'assign', milestoneId: m, name: 'Bob' });

  const state = await store.getState();
  assert.deepEqual(state.employees.map(e => e.name), ['Ann', 'Bob']);
  assert.deepEqual(state.assignments, [{ milestoneId: m, employeeId: ann }, { milestoneId: m, employeeId: bob }]);

  await store.apply({ op: 'unassign', milestoneId: m, employeeId: ann });
  assert.deepEqual((await store.getState()).assignments, [{ milestoneId: m, employeeId: bob }]);
});

test('deleting cascades: project -> milestones -> assignments; employee -> assignments', async () => {
  const store = await freshStore();
  const p = await store.apply({ op: 'addProject', name: 'P' });
  const m = await store.apply({ op: 'addMilestone', projectId: p, name: 'M' });
  const ann = await store.apply({ op: 'assign', milestoneId: m, name: 'Ann' });
  const p2 = await store.apply({ op: 'addProject', name: 'P2' });
  const m2 = await store.apply({ op: 'addMilestone', projectId: p2, name: 'M2' });
  await store.apply({ op: 'assign', milestoneId: m2, name: 'Ann' });

  await store.apply({ op: 'deleteProject', id: p });
  let state = await store.getState();
  assert.deepEqual(state.milestones.map(x => x.id), [m2]);
  assert.deepEqual(state.assignments, [{ milestoneId: m2, employeeId: ann }]);
  assert.equal(state.employees.length, 1, 'employees are kept when a project goes');

  await store.apply({ op: 'deleteEmployee', id: ann });
  state = await store.getState();
  assert.deepEqual(state.assignments, []);
  assert.equal(state.milestones.length, 1);
});

test('edits to something already deleted are refused with a clear message', async () => {
  const store = await freshStore();
  const p = await store.apply({ op: 'addProject', name: 'P' });
  const m = await store.apply({ op: 'addMilestone', projectId: p, name: 'M' });
  await store.apply({ op: 'deleteProject', id: p });

  await rejects(store.apply({ op: 'renameMilestone', id: m, name: 'X' }), 404, 'no longer exists');
  await rejects(store.apply({ op: 'addMilestone', projectId: p, name: 'X' }), 404);
  await rejects(store.apply({ op: 'assign', milestoneId: m, name: 'Ann' }), 404);
});

test('bad input is refused', async () => {
  const store = await freshStore();
  await rejects(store.apply({ op: 'dropTables' }), 400, 'Unknown edit');
  await rejects(store.apply({ op: 'constructor' }), 400, 'Unknown edit');
  await rejects(store.apply(null), 400);
  await rejects(store.apply({ op: 'addProject', name: '   ' }), 400);
  await rejects(store.apply({ op: 'addProject', name: 'x'.repeat(201) }), 400);
  await rejects(store.apply({ op: 'deleteProject', id: '1; drop table projects' }), 400, 'Invalid id');
  assert.equal((await store.getState()).projects.length, 0);
});

test('each table stops growing at its limit', async t => {
  const saved = { ...LIMITS };
  Object.assign(LIMITS, { projects: 2, milestonesPerProject: 2, employees: 2, assignments: 3 });
  t.after(() => Object.assign(LIMITS, saved));

  const store = await freshStore();
  const p = await store.apply({ op: 'addProject', name: 'P1' });
  const p2 = await store.apply({ op: 'addProject', name: 'P2' });
  await rejects(store.apply({ op: 'addProject', name: 'P3' }), 409, 'at most 2 projects');

  const m = await store.apply({ op: 'addMilestone', projectId: p, name: 'M1' });
  const m2 = await store.apply({ op: 'addMilestone', projectId: p, name: 'M2' });
  await rejects(store.apply({ op: 'addMilestone', projectId: p, name: 'M3' }), 409, 'milestones per project');
  const m3 = await store.apply({ op: 'addMilestone', projectId: p2, name: 'M1' }); // other project still has room

  await store.apply({ op: 'assign', milestoneId: m, name: 'Ann' });
  await store.apply({ op: 'addEmployee', name: 'Bob' });
  await rejects(store.apply({ op: 'addEmployee', name: 'Cy' }), 409, 'at most 2 resources');
  await rejects(store.apply({ op: 'assign', milestoneId: m, name: 'Cy' }), 409, 'at most 2 resources');
  // Existing people can still be assigned until the assignment limit.
  await store.apply({ op: 'assign', milestoneId: m2, name: 'Ann' });
  await store.apply({ op: 'assign', milestoneId: m3, name: 'Bob' });
  await rejects(store.apply({ op: 'assign', milestoneId: m2, name: 'Bob' }), 409, 'assignments');

  const state = await store.getState();
  assert.deepEqual([state.projects.length, state.milestones.length, state.employees.length, state.assignments.length], [2, 3, 2, 3]);
});

test('CSV export turns spreadsheet formulas into plain text', () => {
  const csv = toCsv({
    projects: [{ id: 1, name: '=HYPERLINK("http://evil","x")' }, { id: 2, name: '+1' }, { id: 3, name: '@SUM(A1)' }, { id: 4, name: '-2' }],
    milestones: [], employees: [], assignments: [],
  });
  assert.equal(csv, `Project,Milestone,Employee\r\n"'=HYPERLINK(""http://evil"",""x"")",,\r\n'+1,,\r\n'@SUM(A1),,\r\n'-2,,\r\n`);
});

test('CSV export quotes commas and keeps projects and milestones with nobody on them', () => {
  const csv = toCsv({
    projects: [{ id: 1, name: 'Fiber, Phase 2' }, { id: 2, name: 'Empty' }],
    milestones: [{ id: 1, projectId: 1, name: 'FAT' }],
    employees: [{ id: 1, name: 'Loner' }],
    assignments: [],
  });
  assert.equal(csv, 'Project,Milestone,Employee\r\n"Fiber, Phase 2",FAT,\r\nEmpty,,\r\n');
});
