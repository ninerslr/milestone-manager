// The database tables. `npm run db:migrate` runs these against Neon, and the
// tests run the same statements against an in-process Postgres (PGlite).
// Every statement is safe to run again.
//
// Model (decided in issues #2, #3, #4):
//   Project 1-* Milestone *-* Employee, via assignments.
//   A milestone has only a name, unique within its project.
//   An assignment is only the link; it has no extra fields.
// Names are unique ignoring case, matching the page's own checks.
export const SCHEMA = [
  `create table if not exists projects (
    id   serial primary key,
    name text   not null
  )`,
  `create unique index if not exists projects_name on projects (lower(name))`,
  `create table if not exists milestones (
    id         serial  primary key,
    project_id integer not null references projects (id) on delete cascade,
    name       text    not null
  )`,
  `create unique index if not exists milestones_name on milestones (project_id, lower(name))`,
  `create table if not exists employees (
    id   serial primary key,
    name text   not null
  )`,
  `create unique index if not exists employees_name on employees (lower(name))`,
  `create table if not exists assignments (
    milestone_id integer not null references milestones (id) on delete cascade,
    employee_id  integer not null references employees (id) on delete cascade,
    primary key (milestone_id, employee_id)
  )`,
  // Wrong login passwords, for the attempt limits in auth.js. Rows older
  // than a day are deleted as new ones arrive.
  `create table if not exists login_failures (
    ip text        not null,
    at timestamptz not null default now()
  )`,
  `create index if not exists login_failures_at on login_failures (at)`,
];
