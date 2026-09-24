# Milestone Manager: Wireframe

A clickable, low-fidelity wireframe for a tool that manages which milestones apply to a project and which employees are assigned to each one.

> **Terminology:** "milestone" means a project-management milestone, a category of work on a project such as Travel Time, Project Support or Installation. It does **not** mean a DevOps or issue-tracker milestone (GitHub/Azure DevOps).

## Live link

**https://milestone-manager-eight.vercel.app**

Hosted on Vercel. Each push to `main` redeploys it. Share the URL with anyone who needs to click through it.

## Data: a flat file for now

All data comes from **`data/assignments.csv`**, one row per assignment:

```
Project,Milestone,Employee
Altera_Inter Building Fiber 2026,Travel Time,Justin Byrne
```

A row with an empty `Milestone` is a project with no milestones yet. A row with an empty `Employee` is a milestone with nobody assigned yet.

- Edits made in the page stay **in your browser only** and are lost when you reload. A Vercel site can't write to its own files.
- **Download CSV** (top right) exports the current state in the same format. To make it the new starting data, replace `data/assignments.csv` with it and push.
- Saving edits online (to a Neon Postgres database) is the planned next step.

The starting data was transcribed from `Milestone_Employee_Assignment.png`: 2 projects, 5 milestones, 11 employees and 23 assignments.

## Run locally

The page loads the CSV over HTTP, so opening `index.html` straight from disk won't work. Instead, from this folder:

```
npx serve .
```

## The page

Everything happens on one page:

- **Projects (left):** pick a project, or type a name and click **+ Project** to create one.
- **The selected project (right):** click its name to rename it, or delete it. Its milestones are listed underneath:
  - **+ Milestone** adds a milestone to this project.
  - Click a milestone's name to rename it, or click **Remove** to delete it.
  - **Assign** adds an employee to the milestone. Pick an existing name or type a new one. Click **×** to unassign someone.

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
| `index.html` | The page layout and styling. |
| `app.js` | Loads the CSV, draws the page, handles edits and the CSV export. |
| `data/assignments.csv` | The data. |

## Open decisions

The design questions still to be answered are tracked as issues labeled [`decision`](https://github.com/ninerslr/milestone-manager/issues?q=is%3Aissue+is%3Aopen+label%3Adecision).
