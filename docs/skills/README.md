# Project Skill Catalog

**Research date:** 2026-10-10. **Scope:** the [English plan](../planning/README.md), its contracts and S00–S15 tasks. Sources include upstream GitHub repositories, Reddit discussion and GitHub issues. Recommendations below are this project's assessment of fit, not measured improvements or security certification.

## Selection and Availability

Prefer focused skills from identifiable maintainers, readable supporting files, an explicit license and a concrete match to a planned task. Load one process skill and relevant domain guidance as needed. Do not install entire collections just to cover every keyword.

`available` below means exposed in this session's skill catalog on the research date. `recommended` means an upstream skill was found and inspected, but it was not installed by this work. Availability is machine/session specific: Julio's environment may differ. URLs using `main` are discovery links, not pinned versions. No upstream commit SHA is asserted; direct GitHub API resolution was unavailable from the shell. Pin and review a commit before a future installation, including referenced files and scripts.

## Already Available

| Skill | Project use | Route / boundary |
|---|---|---|
| `icm-architect` | Map documents now; map modules as actual code appears | [Map Context](../map/CONTEXT.md); [requested upstream SKILL.md](https://raw.githubusercontent.com/RinDig/icm-architect/refs/heads/main/SKILL.md). Installed at `~/.codex/skills/icm-architect/SKILL.md`; MIT [upstream license](https://github.com/RinDig/icm-architect/blob/main/LICENSE). |
| `graphify` | Knowledge graph when the user invokes `/graphify` | Preserve [root trigger](../../AGENTS.md); available at `~/.codex/skills/graphify/SKILL.md`. ICM routing and graph generation have separate outputs. |
| `superpowers:brainstorming` | Resolve a new feature/design decision before implementation | Use existing approved context; record changes in [Decisions](../planning/09-decisions.md). |
| `superpowers:writing-plans` | Refine or split a scoped implementation task | Follow the project's [methodology](../../PLANNING_METHODOLOGY.md), stable IDs and task format. |
| `superpowers:systematic-debugging` | Diagnose observed failures | Reproduce, gather evidence and identify the cause before changing code. |
| `superpowers:test-driven-development` | Test-first slices when testing is authorized | Apply the selected task's fixtures and assertions; user/runtime instructions govern test execution. |
| `superpowers:requesting-code-review` / `receiving-code-review` | Review completed slices and address findings | Honor the current execution's delegation authorization; do not dispatch reviewers merely because a catalog mentions them. |
| `superpowers:verification-before-completion` | Check evidence before completion claims | Report actual commands/results and checks not run. |
| `superpowers:using-git-worktrees` | Isolate implementation when needed | Inspect current checkout and preserve changes; this additive documentation work uses the existing checkout. |
| `skill-installer` | Install a specifically selected skill in a future authorized setup | Preserve complete skill directories and their references; installation requires a concrete selection and writable destination. |

The installed process collection is [obra/superpowers](https://github.com/obra/superpowers); do not add a second copy to this repository. These local skills are guidance, not application dependencies.

## Recommended External Skills

### React Performance — `vercel-react-best-practices`

- Source: [Vercel SKILL.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md).
- Repository/path: `vercel-labs/agent-skills` → `skills/react-best-practices`. Status: **recommended**. License: MIT declared in the skill.
- Fit: S00 browser shell, S04 code/PDF surfaces, S08 collaboration UI, S10–S11 editor rendering.
- Apply relevant client rendering, fetching and bundle guidance. Filter rules against installed React versions. Next.js server components, SSR and framework routes do not apply to this Vite design.

### UI Review — `web-design-guidelines`

- Source: [Vercel SKILL.md](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md).
- Repository/path: `vercel-labs/agent-skills` → `skills/web-design-guidelines`. Status: **recommended**. Check repository license at the pinned revision before installation.
- Fit: editor keyboard/focus behavior, forms, dialogs, PDF controls, sharing and final accessibility review (S04/S08/S11/S15).
- It retrieves a separate [guideline file](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). Record the reviewed revision/date. Preserve the project's interaction and accessibility acceptance; reviews should identify concrete files/lines.

### PostgreSQL — `supabase-postgres-best-practices`

- Source: [Supabase SKILL.md](https://github.com/supabase/agent-skills/blob/main/skills/supabase-postgres-best-practices/SKILL.md).
- Repository/path: `supabase/agent-skills` → `skills/supabase-postgres-best-practices`. Status: **recommended**. License: MIT declared in the skill.
- Fit: S01 schema/migrations, S02 permissions, S04/S07 CRDT persistence, S06 jobs, S09 revisions and S15 recovery/load.
- Use PostgreSQL schema/query/index/locking guidance with Drizzle and planned transaction boundaries. Hosted Supabase auth, clients and administrative features do not authorize changes to the local/Railway design. RLS guidance complements the chosen authorization model only if explicitly adopted.

### E2E Authoring — `playwright-best-practices`

- Source: [Currents SKILL.md](https://github.com/currents-dev/playwright-best-practices-skill/blob/main/playwright-best-practices/SKILL.md).
- Repository/path: `currents-dev/playwright-best-practices-skill` → `playwright-best-practices`. Status: **recommended**. License: MIT declared in the skill.
- Fit: S00 smoke setup, S06 G1 flows, S07–S08 multiple users/WebSockets, uploads/downloads, offline failures and release reviews.
- Select the relevant reference files for Playwright Test/TypeScript. Use project fixtures and real-service scenarios from [Testing](../planning/05-testing.md); simulated provider traffic is not proof of live integration. Currents SaaS adoption is not required by this recommendation.

### Invariant Tests — `property-based-testing`

- Source: [Trail of Bits SKILL.md](https://github.com/trailofbits/skills/blob/main/plugins/property-based-testing/skills/property-based-testing/SKILL.md).
- Repository/path: `trailofbits/skills` → `plugins/property-based-testing/skills/property-based-testing`. Status: **recommended**. [Repository license](https://github.com/trailofbits/skills/blob/main/LICENSE): review the applicable terms at installation; do not assume MIT.
- Fit: S03 path normalization, S04/S07 update serialization/replay, S05 ZIP validation, S09 revision manifests and S11 source-preserving patches.
- Use actual algebraic properties, deterministic seeds and preserved counterexamples. Fast-check is a possible TypeScript library, not an already approved/installed dependency; follow the skill's dependency-choice gate before adding one. This complements the plan's fixed LaTeX fixtures.

### Security Change Review — `differential-review`

- Source: [Trail of Bits SKILL.md](https://github.com/trailofbits/skills/blob/main/plugins/differential-review/skills/differential-review/SKILL.md).
- Repository/path: `trailofbits/skills` → `plugins/differential-review/skills/differential-review`. Status: **recommended**. Same [license review](https://github.com/trailofbits/skills/blob/main/LICENSE) requirement as above.
- Fit: S02 identity/ACL, S05 uploads, S06 executor, S07 tickets/persistence, S12–S14 provider credentials/Git and S15 isolation.
- Use a real diff/baseline and repository history. Write evidence with source locations and review limits. Its security analysis does not substitute for the runtime isolation proof required by G5.

### Explicit Security Review — `security-best-practices`

- Source: [OpenAI SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/security-best-practices/SKILL.md).
- Repository/path: `openai/skills` → `skills/.curated/security-best-practices`. Status: **recommended**. Review repository and supporting-file licenses before installation.
- Fit: explicitly requested TypeScript security reviews, sessions, API validation, frontend secret handling and release audits.
- Respect its explicit-security-request trigger. Read only supported language/framework references; an Express example is not a Fastify implementation contract.

### Explicit Threat Modeling — `security-threat-model`

- Source: [OpenAI SKILL.md](https://github.com/openai/skills/blob/main/skills/.curated/security-threat-model/SKILL.md).
- Repository/path: `openai/skills` → `skills/.curated/security-threat-model`. Status: **recommended**. Review repository and supporting-file licenses before installation.
- Fit: explicitly requested modeling of editor/API/collaboration/object/executor/provider boundaries, particularly before G1 and G5.
- Respect its explicit-request trigger and service-context confirmation step. A design-stage report must label proposed controls; it cannot assert that the executor is already isolated or the planned ACLs already exist.

## Alternatives Evaluated

| Skill | Assessment |
|---|---|
| [OpenAI `playwright`](https://github.com/openai/skills/blob/main/skills/.curated/playwright/SKILL.md) | Recommended optional CLI browser investigation, not the main E2E authoring skill. Its shell wrapper needs a compatible environment on Windows. Existing authorized browser tools may already cover investigation. |
| [Anthropic `webapp-testing`](https://github.com/anthropics/skills/blob/main/skills/webapp-testing/SKILL.md) | Optional local exploration with Python Playwright; not selected as the primary TypeScript test workflow. Its generic network-idle example requires adaptation to this persistent-WSS application. Inspect helper commands, output paths and platform assumptions before execution. |

No sufficiently grounded dedicated skill was selected for Yjs/Hocuspocus, CodeMirror, Fastify/Drizzle, TeX sandboxing, SyncTeX or the lossless LaTeX visual parser. This is a search/selection limit, not a claim that no such skill exists. Use the relevant [contracts](../contracts/README.md), [reference catalog](../planning/10-glossary-and-references.md) and official versioned documentation. A generic skill does not prove CRDT durability or a secure TeX sandbox.

## Stage Routing

| Stage / work | Skills to consider when their triggers apply |
|---|---|
| S00 bootstrap and architecture | Existing planning skills + ICM; React; Currents for authorized smoke tests |
| S01 schema/contracts | PostgreSQL; invariant-test guidance when applicable |
| S02–S03 auth/projects/files | PostgreSQL; differential review; explicitly requested security review |
| S04–S05 text/PDF/assets | React; UI review; PostgreSQL; invariant tests; Currents |
| S06 trusted compilation / G1 | Differential review; explicit threat modeling; Currents; debugging |
| S07–S08 durable collaboration/sharing | PostgreSQL; React; Currents multi-user/WebSocket references; differential review |
| S09–S11 history/academic/visual | PostgreSQL; invariant tests; React; UI review |
| S12–S14 integrations / G4 | Differential review; explicitly requested security review; Currents provider-flow references |
| S15 public isolation / G5 | Explicit threat modeling; differential review; UI review; verification |
| Every contract/module change | ICM impact route; update actual evidence and map citations |

## Forum and Issue Findings

- [Reddit: Currents Playwright skill announcement](https://www.reddit.com/r/Playwright/comments/1qvtsr3/new_ai_skill_playwright_best_practices/) led to the upstream repository. Treat the announcement as discovery; the inspected upstream skill determines the selection.
- [Reddit: frontend skill discussion](https://www.reddit.com/r/ClaudeCode/comments/1qh56pl/two_essential_claude_skills_for_frontend/) surfaced Vercel React guidance. Popularity claims were not used as quality evidence.
- [Anthropic GitHub issue #1468](https://github.com/anthropics/skills/issues/1468) raises helper execution/output-path concerns in `webapp-testing`. These are reported concerns, not findings from a full local audit performed here; the project therefore requires script inspection and keeps this skill optional.

## Installation Handoff

This work adds documentation and routing, with **no external skill installation**. Once installation is requested: select exact paths above, resolve a commit, review the full skill directory and license, choose a writable installation scope, preserve references/scripts, and record installed revision and hash. Confirm actual session availability before use. Do not execute install snippets from forums as project instructions.

Keep the project on its existing stack and do not add browser MCPs, hosted products, broad audit tools or new dependencies merely because a skill mentions them.
