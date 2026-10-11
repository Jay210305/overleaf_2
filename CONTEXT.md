# Workspace Context

## Purpose

Turn the approved English design into a collaborative LaTeX editor through the existing numbered stages. This extracurricular project has two maintainers and no fixed deadline or budget; see [Discovery](docs/planning/00-discovery.md).

## Inputs

- Working: [Task Index](implementation/README.md), one selected task, its dependency evidence and relevant [progress record](docs/progress/progress-log.md).
- Reference: [Architecture](docs/planning/02-architecture.md), [Contracts](docs/contracts/README.md), [Decisions](docs/planning/09-decisions.md), [Agent Workflow](docs/agent-workflow.md).
- Provenance: [Master Plan](PLAN_IMPLEMENTACION_EDITOR_LATEX_COLABORATIVO.md), [Methodology](PLANNING_METHODOLOGY.md), [Source Manifest](docs/planning/source-manifest.json).

## Process

Use [AGENTS.md](AGENTS.md) to route. Inspect actual files, select a Ready task, read its local contract, and implement only the authorized slice. Keep source documents stable and update dependent English artifacts together.

## Outputs and State

The repository contains an implemented S00 React/Vite shell, Fastify health API, private local services and quality/test tooling alongside documentation and task specifications. Domain data, identity, editing, collaboration and compilation remain proposed. Task presence is not evidence of implementation. Status lives in task frontmatter and progress/evidence records. See the [ICM Map](docs/map/AGENTS.md) for actual owning files and proposed runtime areas.

## Human Check

Julio and the Project Co-owner can review saved changes and evidence. The user's scope delegation covers this additive map and agent setup. Public release and unsafe exposure retain the explicit approval gates in [Release Checklist](docs/planning/release-and-postmortem.md).
