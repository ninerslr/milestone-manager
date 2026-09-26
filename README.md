# Milestone Manager

A tool that manages which milestones apply to a project and which employees are assigned to each one.

> **Terminology:** "milestone" means a project-management milestone, a category of work on a project such as Travel Time, Project Support or Installation. It does **not** mean a DevOps or issue-tracker milestone (GitHub/Azure DevOps).

## Live link

**https://milestone-manager-eight.vercel.app**

Hosted on Vercel. Each push to `main` redeploys it. Share the URL with anyone who needs to click through it.

## Data: a Neon Postgres database

Everything is saved in a Neon Postgres database (free plan, us-west-2), so edits are kept and everyone sees the same data. Each edit is saved as soon as you make it; the header shows **Saving…** / **All changes saved**.

- **Download CSV** (top right) exports what is saved in the database, one row per assignment:

  ```
  Project,Milestone,Employee
  Altera_Inter Building Fiber 2026,Travel Time,Justin Byrne
  ```

  A row with an empty `Milestone` is a project with no milestones yet. A row with an empty `Employee` is a milestone with nobody assigned yet. A resource with no assignments has no row, so they are not in the export.
- **`data/assignments.csv`** is the starting data. `npm run db:migrate` loads it into a new, empty database, and never touches a database that already has projects.
- **Size limits:** at most 200 projects, 50 milestones per project, 500 resources and 10,000 assignments; names at most 200 characters. The page shows a message when a limit is reached.

## Sign-in

The whole site is behind one shared password, `SITE_PASSWORD` (Doppler `milestone-manager/prd`, and Vercel env vars). Signing in lasts 7 days; **Sign out** is top right.

- To change the password, change it in Doppler and in Vercel, then redeploy. Everyone is signed out.
- After 5 wrong passwords from one address in 15 minutes, that address has to wait. After 200 wrong passwords across the whole site in 15 minutes, all new sign-ins pause for a while; people already signed in are not affected.
- The CSV export turns cells that start with `= + - @` into plain text, so a name can't run as a spreadsheet formula.

## Run locally

Needs Node 22+, the database connection string and the site password. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (the pooled Neon URL) and `SITE_PASSWORD` (or run the commands through `doppler run -p milestone-manager -c prd --`). Then:

```
npm install
npm run db:migrate   # create the tables (and load the CSV into an empty database)
npm run dev          # http://localhost:3000
npm test             # tests run against an in-process Postgres, no database needed
```

On Vercel, `DATABASE_URL` and `SITE_PASSWORD` are set under Project → Settings → Environment Variables.

## The page

Two tabs edit the same data, so a change in one shows up in the other.

**By Project:** manage projects and their milestones, and staff each milestone.

- **Projects (left):** pick a project, or type a name and click **+ Project** to create one.
- **The selected project (right):** click its name to rename it, or delete it. Its milestones are listed underneath:
  - **+ Milestone** adds a milestone to this project.
  - Click a milestone's name to rename it, or click **Remove** to delete it.
  - **Assign** adds a resource to the milestone. Pick an existing name or type a new one. Click **×** to unassign someone.

**By Resource:** assign one person to many milestones at once.

- **Resources (left):** pick a person, or add a new one with **+ Resource**.
- **The selected person (right):** every project is listed with its milestones as checkboxes. Tick all the milestones they work on, across any project, and untick to remove them. Each milestone also shows who else is on it. You can rename or delete the person here too.
- A new person isn't saved in the CSV until they're assigned to at least one milestone.

Milestones belong to their project. There is no separate milestone list, so two projects can each have their own "Travel Time".

## Data model

```
Project 1───* Milestone *───* Employee
                  (via MilestoneAssignment)
```

- **Project**: has many milestones.
- **Milestone**: belongs to exactly one project. Its name is unique within that project.
- **MilestoneAssignment**: links an employee to a milestone. One milestone can have many employees, and one employee can be on many milestones, across projects.

## Files

| File | Purpose |
|---|---|
| `site/index.html` | The page layout and styling (signed-in only). |
| `site/app.js` | Draws both tabs and sends each edit to the API (signed-in only). |
| `site/login.html` | The sign-in page. |
| `api/page.js` | Serves the pages above, checking sign-in first. |
| `api/login.js`, `api/logout.js` | Sign in and out. |
| `api/_lib/auth.js` | Password check, session cookie, wrong-password limits. |
| `api/data.js` | `GET` all data, `POST` one edit. Answers with the fresh data. |
| `api/export.js` | The saved data as a CSV download. |
| `api/_lib/schema.js` | The database tables. |
| `api/_lib/store.js` | Reads and changes the data; checks names, ids and size limits. |
| `api/_lib/csv.js` | CSV reading and writing. |
| `scripts/migrate.js` | Creates the tables; loads the starting CSV into an empty database. |
| `scripts/dev-server.js` | Local server: `public/` plus the `api/` routes, like Vercel. |
| `data/assignments.csv` | The starting data. |

## Open decisions

The design questions still to be answered are tracked as issues labeled [`decision`](https://github.com/ninerslr/milestone-manager/issues?q=is%3Aissue+is%3Aopen+label%3Adecision).
