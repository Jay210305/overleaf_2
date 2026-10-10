# overleaf_2

Extracurricular collaborative LaTeX workspace by Julio and the Project Co-owner.
The project has no fixed deadline or budget and proceeds through verified increments.

Start with the [English Planning Package](docs/planning/README.md).
Use the [Implementation Task Index](implementation/README.md) to select a Ready task.
The [Roadmap](docs/planning/04-implementation-roadmap.md) records proposed owners,
effort, dependencies and release gates. The S00-T03 pnpm/TypeScript workspace bootstrap
exists; browser, API and service behavior is still pending.

The original [Spanish Master Plan](PLAN_IMPLEMENTACION_EDITOR_LATEX_COLABORATIVO.md)
and [Planning Methodology](PLANNING_METHODOLOGY.md) remain preserved for provenance.
The English package records the context adaptations and new planning decisions.

Validate the plan:

```text
python scripts/plan_lint.py
```

Check the current workspace bootstrap with pinned pnpm:

```text
pnpm install --frozen-lockfile
pnpm exec vitest run tests/integration/s00-t03.test.ts tests/regression/pl-01/s00-t03.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm build` currently compiles the workspace validation tool. It does not build an application bundle; see the [S00-T03 report](docs/test-reports/s00-t03.md).

Agent setup: [AGENTS.md](AGENTS.md), [Agent Workflow](docs/agent-workflow.md),
[Skill Research and Routing](docs/skills/README.md), and [ICM Project Map](docs/map/AGENTS.md).

Refresh and check the map:

```text
python scripts/build_icm_map.py
python scripts/build_icm_map.py --check
```
