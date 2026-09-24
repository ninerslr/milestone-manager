# Milestone Manager: Wireframe

A clickable, low-fidelity wireframe for a tool that manages which milestones apply to a project and which employees are assigned to each one.

## Run

Open `index.html` in a browser. It needs no build step and no server. All data is sample data held in memory, and it resets when you reload.

## Screens

| Tab | What it shows |
|---|---|
| **Projects** | Pick a project, tick milestones from the library to add them to it, then set a due date and status and assign employees on each milestone card. |
| **Employees** | Pick an employee to see every project milestone they're on, who else is on it, and controls to add or remove associations. |
| **Milestone Library** | The reusable milestone list that projects choose from, and where each milestone is used. You can add new milestones here. |

## Data model

```
Project 1───* ProjectMilestone *───1 Milestone (library)
                    │
                    * 
            MilestoneAssignment   (junction: many-to-many)
                    *
                    │
                    1
                Employee
```

- **Milestone**: a reusable template in the library (for example Kickoff, FAT, SAT).
- **ProjectMilestone**: a milestone selected for one project. It holds the due date and status.
- **MilestoneAssignment**: links an employee to a project milestone. One milestone can have many employees, and one employee can have many milestones.

## Assumptions to confirm

1. Employees are assigned to a milestone **on a specific project**, not to the library milestone in general.
2. Milestones come from a shared library, and projects choose from it. Project-specific custom milestones are not modeled yet.
3. Each assignment is a plain link, with no role, hours, or allocation %.
