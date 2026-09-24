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

A row with an empty `Employee` means the milestone is on the project but no one is assigned yet.

- Edits made in the page stay **in your browser only** and are lost when you reload. A Vercel site can't write to its own files.
- **Download CSV** (top right) exports the current state in the same format. To make it the new starting data, replace `data/assignments.csv` with it and push.
- Saving edits online (to a Neon Postgres database) is the planned next step.

The starting data was transcribed from `Milestone_Employee_Assignment.png`: 2 projects, 5 milestones, 11 employees and 23 assignments.

## Run locally

The page loads the CSV over HTTP, so opening `index.html` straight from disk won't work. Instead, from this folder:

```
npx serve .
```

## Screens

| Tab | What it shows |
|---|---|
| **Projects** | Pick a project, tick milestones to add them to it, and assign or remove employees on each milestone card. |
| **Employees** | Pick an employee to see every project milestone they're on and who else is on it, and add or remove their assignments. |
| **Milestone Library** | Every milestone name and the projects that use it. You can add new ones here. |

## Data model

```
Project 1───* ProjectMilestone *───1 Milestone (shared name)
                    │
                    *
            MilestoneAssignment   (junction: many-to-many)
                    *
                    │
                    1
                Employee
```

- **Milestone**: a milestone name that more than one project can use (for example Travel Time).
- **ProjectMilestone**: a milestone selected for one project.
- **MilestoneAssignment**: links an employee to a project milestone. One milestone can have many employees, and one employee can have many milestones.

## Files

| File | Purpose |
|---|---|
| `index.html` | The page layout and styling. |
| `app.js` | Loads the CSV, draws the screens, handles edits and the CSV export. |
| `data/assignments.csv` | The data. |

## Open decisions

The design questions still to be answered are tracked as issues labeled [`decision`](https://github.com/ninerslr/milestone-manager/issues?q=is%3Aissue+is%3Aopen+label%3Adecision).
