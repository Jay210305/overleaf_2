# System Map Context

## Purpose and Method

Provide orientation and first-order edit impact for the existing documentation repository. Uses the requested [ICM Architect](https://raw.githubusercontent.com/RinDig/icm-architect/refs/heads/main/SKILL.md) and its installed system-map guidance. Source files own facts; cards link to them.

## Inputs

- Working: actual repository files, current diffs, selected task and its evidence.
- Reference: [Catalog](CLAUDE.md), [Schema](_meta/schema.md), [Planning](../planning/README.md), [Contracts](../contracts/README.md).
- Inventory: [generated file snapshot](_meta/file-inventory.json), with per-file SHA-256 and git baseline. This distinguishes the working snapshot from a committed release.

## Classification

| Universe | Meaning here |
|---|---|
| `live` | Operative documentation or an existing local documentation tool |
| `ghost` | Planned app/module path with no inspected runtime implementation |
| `leftover` | A retained superseded path; none declared by this initial map |

Object status is `stub`, `verified` or `stale`. Runtime readiness is separate. A verified ghost card only verifies the design reference and explicitly says runtime is proposed. This map keeps ghost cards `stub` until actual code is inspected.

## Process and Outputs

1. Open [change impact](effects/CONTEXT.md), one relevant card and its owning source.
2. Edit the owning source; update the card only when ownership, constraints or direct relationships change.
3. Record citations, verification date and working snapshot reference. Refresh source hashes and catalog twins with `python scripts/build_icm_map.py`.
4. Run the documentation checks in [Scripts Context](../../scripts/CONTEXT.md). Read the resulting index and changed card before moving to another slice.

Outputs: authored cards/contracts; generated catalog twins, object index and file inventory. Keep templates in [_templates](_templates/CONTEXT.md). Do not hand-edit generated outputs.

## Authorization and Review

The user explicitly requested project mapping and delegated scope decisions. That authorizes this additive map; existing folders, task IDs and source documents retain their paths. ICM's intermediate human gates are adapted to saved, reviewable slices plus a cold walk for this task, using that authorization. Future file moves, deletions or changed public-release boundaries require their own applicable authorization and reference-integrity review.

External consumers of repository paths (other repos, jobs, issue links) are **unknown**, not absent. No paths are moved in this setup. Before a later relocation, enumerate in-repository referrers and resolve known external consumers with maintainers.

## Cold Walk

Root [AGENTS.md](../../AGENTS.md) → map catalog → one card must identify the owner and direct impact. Follow its source link and distinguish design from evidence. For collaboration durability, open API/Durable Data, then the collaboration contract; for skill choice, open Agent Guidance, then the skill catalog. Verify sources and hashes before marking a card verified after a change.

Initial observed routes and documentation-check results: [Walk Report](_meta/walk-report.md).
