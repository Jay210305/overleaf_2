# overleaf_2

Extracurricular collaborative LaTeX workspace by Julio and the Project Co-owner.
The project has no fixed deadline or budget and proceeds through verified increments.

Start with the [English Planning Package](docs/planning/README.md).
Use the [Implementation Task Index](implementation/README.md) to select a Ready task.
The [Roadmap](docs/planning/04-implementation-roadmap.md) records proposed owners,
effort, dependencies and release gates. Product implementation has not started.

The original [Spanish Master Plan](PLAN_IMPLEMENTACION_EDITOR_LATEX_COLABORATIVO.md)
and [Planning Methodology](PLANNING_METHODOLOGY.md) remain preserved for provenance.
The English package records the context adaptations and new planning decisions.

Validate the plan:

```text
python scripts/plan_lint.py
```

Agent setup: [AGENTS.md](AGENTS.md), [Agent Workflow](docs/agent-workflow.md),
[Skill Research and Routing](docs/skills/README.md), and [ICM Project Map](docs/map/AGENTS.md).

Refresh and check the map:

```text
python scripts/build_icm_map.py
python scripts/build_icm_map.py --check
```
