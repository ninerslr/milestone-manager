# Milestone Manager: Wireframe

A clickable, low-fidelity wireframe for a tool that manages which milestones apply to a project and which employees are assigned to each one.

> **Terminology:** "milestone" means a project-management milestone, a key point in a project's schedule such as Kickoff, FAT, SAT or Handover. It does **not** mean a DevOps or issue-tracker milestone (GitHub/Azure DevOps), so there are no releases, sprints, issues or repos in this tool.

## Review it

**Live wireframe:** https://ninerslr.github.io/milestone-manager/

It opens in any browser. All data is made-up sample data held in memory, so it resets when you reload.

**To leave feedback:** [open a Review feedback issue](https://github.com/ninerslr/milestone-manager/issues/new?template=review-feedback.yml). You need a free GitHub account for this.

## How work flows

1. Feedback and changes are tracked as **issues**. Open design questions carry the `decision` label.
2. Each change is made on a branch and merged through a **pull request** that references its issue.
3. When a change merges to `main`, **GitHub Pages** republishes the live link automatically, usually within a minute or two.

To run it locally, open `index.html` in a browser. There's no build step and no server.

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

## Open decisions

The design questions still to be answered are tracked as issues labeled [`decision`](https://github.com/ninerslr/milestone-manager/issues?q=is%3Aissue+is%3Aopen+label%3Adecision).
