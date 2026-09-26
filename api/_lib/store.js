// Reads and changes the data in Postgres.
//
// It is handed a `query(text, params) -> rows` function instead of opening a
// connection itself: on the site that function talks to Neon, in the tests to
// PGlite. Values always go in through $1 placeholders, never glued into SQL.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const MAX_NAME_LENGTH = 200;

function name(value) {
  const n = typeof value === 'string' ? value.trim() : '';
  if (!n) throw new HttpError(400, 'A name is required.');
  if (n.length > MAX_NAME_LENGTH) throw new HttpError(400, `Names can be at most ${MAX_NAME_LENGTH} characters.`);
  return n;
}

function id(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(400, 'Invalid id.');
  return n;
}

const GONE = 'That item no longer exists. Someone else may have deleted it.';

// Postgres error codes for "duplicate name" and "the thing it points at is gone".
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

export function createStore(query) {
  // Runs a statement that should touch exactly one row, and turns the two
  // expected failures into messages the page can show.
  async function one(text, params, duplicateMessage) {
    let rows;
    try {
      rows = await query(text, params);
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) throw new HttpError(409, duplicateMessage);
      if (err.code === FOREIGN_KEY_VIOLATION) throw new HttpError(404, GONE);
      throw err;
    }
    if (!rows.length) throw new HttpError(404, GONE);
    return rows[0].id;
  }

  const projectExists = n => `A project named "${n}" already exists.`;
  const milestoneExists = n => `This project already has a "${n}" milestone.`;
  const employeeExists = n => `A resource named "${n}" already exists.`;

  async function assign(milestoneId, employeeName) {
    const n = name(employeeName);
    // Reuse the employee if the name exists (any case), otherwise create them.
    const [emp] = await query(
      `with found as (select id from employees where lower(name) = lower($1)),
            made as (insert into employees (name) select $1 where not exists (select 1 from found)
                     on conflict do nothing returning id)
       select id from found union all select id from made`,
      [n],
    );
    // Only missing if someone created the same name at this exact moment.
    if (!emp) throw new HttpError(409, 'That resource was just added by someone else. Try again.');
    try {
      await query(
        `insert into assignments (milestone_id, employee_id) values ($1, $2) on conflict do nothing`,
        [id(milestoneId), emp.id],
      );
    } catch (err) {
      if (err.code === FOREIGN_KEY_VIOLATION) throw new HttpError(404, GONE);
      throw err;
    }
    return emp.id;
  }

  // One entry per edit the page can make. Each returns the id it created or
  // changed, so the page can select it.
  const OPS = {
    addProject: b => one(`insert into projects (name) values ($1) returning id`, [name(b.name)], projectExists(name(b.name))),
    renameProject: b => one(`update projects set name = $2 where id = $1 returning id`, [id(b.id), name(b.name)], projectExists(name(b.name))),
    deleteProject: b => query(`delete from projects where id = $1`, [id(b.id)]),
    addMilestone: b => one(`insert into milestones (project_id, name) values ($1, $2) returning id`, [id(b.projectId), name(b.name)], milestoneExists(name(b.name))),
    renameMilestone: b => one(`update milestones set name = $2 where id = $1 returning id`, [id(b.id), name(b.name)], milestoneExists(name(b.name))),
    deleteMilestone: b => query(`delete from milestones where id = $1`, [id(b.id)]),
    addEmployee: b => one(`insert into employees (name) values ($1) returning id`, [name(b.name)], employeeExists(name(b.name))),
    renameEmployee: b => one(`update employees set name = $2 where id = $1 returning id`, [id(b.id), name(b.name)], employeeExists(name(b.name))),
    deleteEmployee: b => query(`delete from employees where id = $1`, [id(b.id)]),
    assign: b => assign(b.milestoneId, b.name),
    unassign: b => query(`delete from assignments where milestone_id = $1 and employee_id = $2`, [id(b.milestoneId), id(b.employeeId)]),
  };

  return {
    async getState() {
      const [projects, milestones, employees, assignments] = await Promise.all([
        query(`select id, name from projects order by id`),
        query(`select id, project_id as "projectId", name from milestones order by id`),
        query(`select id, name from employees order by lower(name), id`),
        query(`select milestone_id as "milestoneId", employee_id as "employeeId" from assignments order by milestone_id, employee_id`),
      ]);
      return { projects, milestones, employees, assignments };
    },

    // Applies one edit. Returns the id it created or changed (if any).
    async apply(body) {
      const op = body && typeof body === 'object' && Object.hasOwn(OPS, body.op) ? OPS[body.op] : null;
      if (!op) throw new HttpError(400, 'Unknown edit.');
      const result = await op(body);
      return typeof result === 'number' ? result : null;
    },
  };
}
