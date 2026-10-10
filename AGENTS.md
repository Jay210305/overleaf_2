# Project Agent Entry

Collaborative LaTeX editor maintained by Julio and the Project Co-owner.
Documentation is in English. Follow the user's language when conversing.

## Start Here

1. Read [Workspace Context](CONTEXT.md) and [Agent Workflow](docs/agent-workflow.md).
2. Inspect actual files and contributor changes before choosing work.
3. Open the relevant route below, then one task and its required contracts.

## Routing

| Need | Open |
|---|---|
| Scope, release gates, team assumptions | [Discovery](docs/planning/00-discovery.md) |
| Planning package | [Planning Catalog](docs/planning/README.md) |
| Select a task and inspect dependencies | [Task Index](implementation/README.md) |
| Interfaces and invariants | [Contract Catalog](docs/contracts/README.md) |
| Understand an area or a change's impact | [ICM Map](docs/map/AGENTS.md) |
| Choose a skill | [Skill Catalog](docs/skills/README.md) |
| Record progress and blockers | [Progress Contract](docs/progress/CONTEXT.md) |
| Validate planning documents | [Validation Contract](scripts/CONTEXT.md) |

## Required Boundaries

The English planning package is the operative baseline; preserve the two original source documents.
Read [Agent Workflow](docs/agent-workflow.md) before implementation or changing task status.
Read [Skill Catalog](docs/skills/README.md) before invoking or adding a skill.
Use `icm-architect` for project mapping; follow [Map Context](docs/map/CONTEXT.md).
Check the actual skill inventory: an external recommendation is not an installed capability.

## Execution Rules

- Before editing, inspect the branch, `git status`, relevant diffs, the selected task's dependencies and its contracts. Preserve contributor files and uncommitted changes; do not reset or overwrite them to make a task pass.
- Work one authorized task slice at a time. If a dependency, required access or evidence is missing, record the precise blocker in [Open Gaps](docs/progress/open-gaps.md) and do only independent work. Keep task IDs and the two original source documents stable.
- Implement real, reviewable behavior. A planned path, mocked provider, dummy PDF or UI-only state is not implementation evidence. Keep unavailable capabilities visibly unavailable.
- Use [Quality Gates](docs/planning/06-ci-cd-and-environments.md) and the task's verification instructions. Run the same available scripts locally and in CI; record actual commands, environment, results and checks not run. Do not claim PASS from a written plan or missing script.
- Record scoped acceptance in `docs/test-reports/`, actual effort only when measured, and synchronize task frontmatter, [Task Index](implementation/README.md), roadmap, [stage progress](docs/progress/sprint-00.md) and [feature evidence](docs/feature-parity.md) when status changes. Require the task's independent co-maintainer review before `done`.
- Enforce server-side authorization for every REST, WSS and object action. Keep canonical per-file Yjs text, commit-before-saved acknowledgements and immutable revision inputs; follow [Contracts](docs/contracts/README.md) before changing these boundaries.
- Keep credentials and private source out of Git, browser bundles, logs, prompts and screenshots. Use only licensed or otherwise authorized code and assets; verify external dependencies before adding them.
- Compile genuine TeX output through the separate trusted executor. Keep anonymous signup and untrusted compilation disabled until G5 isolation evidence and the required release approval; never pass API, database, Redis or general object-store secrets into TeX execution.

## graphify

**Trigger:** `/graphify`.
When the user types `/graphify`, read and follow the installed graphify skill before doing anything else.
Skill location: `~/.codex/skills/graphify/SKILL.md` (Windows paths are case-insensitive).
Use the [ICM Map](docs/map/AGENTS.md) as orientation; graph generation follows graphify's own instructions.
