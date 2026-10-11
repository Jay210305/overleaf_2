# S00-T01 Repository Audit

**Observed:** 2026-10-10 on `feature/sprint-00`, starting commit `d3105dd8f6902c19e827bbb453f59f242b1ce1ad`. **Scope:** repository discovery and preservation only. The acceptance review is in [s00-t01.md](../test-reports/s00-t01.md#acceptance-review).

## Review checklist established before the audit

1. Capture branch, commit, tracked/untracked counts and all starting diffs.
2. Identify actual application/configuration files and locally available tools, without treating planned paths as implemented.
3. Record host prerequisites and which runtime capabilities were actually exercised.
4. Hash both provenance documents before and after this task and compare with [source-manifest.json](../planning/source-manifest.json).
5. List safe bootstrap steps and missing evidence; run the structural validator and record its result.

## Repository facts

At the start, `git status --porcelain=v1 --untracked-files=all`, `git diff --stat`, `git diff --cached --stat`, and `git ls-files --others --exclude-standard` returned no changes. `git ls-files` counted **293 tracked files**: 201 under `implementation/`, 84 under `docs/`, 3 under `scripts/`, and 5 at the root. The complete tracked path list is reproducible with `git ls-files`; [the map file inventory](../map/_meta/file-inventory.json) records the repository snapshot and hashes. There were **zero untracked files** at the start. New audit artifacts and synchronized status edits in this task are intentional; they were not pre-existing contributor changes.

The inspected tree has planning documents, 16 sprint task directories, contracts, a map and two Python documentation scripts. No `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, Compose file, Dockerfile or `.env.example` was found by `rg --files` with those exact names/patterns. There is no application build, local service setup, or product test command to run in this checkout. The [development tooling contract](../contracts/development-tooling.md) describes future interfaces.

| Tool on this Windows host | Observed version / state |
|---|---|
| Git | 2.52.0.windows.1 |
| Python | `python --version` printed 3.14.7, but that launcher failed to run a script with `Failed to find real location of C:\Python314\python.exe`; the bundled Python 3.12.14 executed the documentation checks |
| Node.js / npm | 24.20.0 / 11.19.0 |
| pnpm / Corepack | 11.25.0 / 0.35.0; compatibility with this project is unverified |
| Docker CLI / Compose | 29.8.0 / v5.5.1; `docker info` could not connect to `dockerDesktopLinuxEngine` |
| WSL | `wsl --version` reported 2.7.1.0; `wsl --list --verbose` returned `Wsl/E_ACCESS_DENIED` |

`[Environment]::ProcessorCount` reported 24 and drive C reported about 387 GB free. Windows CIM access to OS/processor/memory details was denied. The managed runtime reported 31.43 GiB as its available memory value, which is not a physical RAM measurement. Host capacity for the planned services and TeX image is **not verified**. The prerequisite classes are a compatible Node/pnpm set, working Docker/Compose with enough local resources, and later a pinned TeX runtime; exact compatible versions and resource needs belong to [S00-T11](../../implementation/sprint-00-bootstrap/S00-T11-check-editor-collaboration-dependency-compatibility.md) and the subsequent setup/compilation tasks. No version pin or image capability is inferred from the installed CLIs.

## Provenance and safe bootstrap

The source manifest's expected SHA-256 values matched this checkout before edits:

| Source | SHA-256 |
|---|---|
| `PLAN_IMPLEMENTACION_EDITOR_LATEX_COLABORATIVO.md` | `338d8bf32297c3de6fc2e3d9be62e5ae2b3f56abd1d547ca2c71fe83a50ada05` |
| `PLANNING_METHODOLOGY.md` | `6bdf434c96ca66a99bd797f3b98ce92342c1dd202fbe58c3c5d891b27f4e1cc0` |

Neither source is an edit target. The structural validator also compares their bytes with the manifest; the final verification records the after-state.

The final SHA-256 check returned the same two values above. `python scripts/build_icm_map.py` could not execute through the broken `python` launcher; the bundled Python path documented in [Scripts Context](../../scripts/CONTEXT.md) was used successfully for the map build, map check and plan lint. This is a local tooling finding, not a change to project Python requirements.

Safe sequence for the next S00 work: inspect `git status` and diffs before each slice; retain the source hashes; complete the scoped compatibility research in S00-T11; check that Docker Desktop's Linux engine is reachable and local resources are measurable; then create pinned manifests and a lockfile in S00-T03. Only after those files exist should a contributor run the contract's frozen install. Later Compose/startup commands belong to S00-T07 and S00-T10 and need their configuration first. Keep local secrets outside Git and public/browser configuration.

## Missing evidence and disposition

- **GAP-01 remains open:** CLI presence does not prove Node/pnpm/Yjs/Hocuspocus compatibility, Docker engine readiness, WSL access or adequate machine capacity. Docker and WSL checks failed as recorded above. No official version compatibility research is claimed here; S00-T11 owns it.
- **Follow-up on 2026-10-10:** the user reported Docker is now up. A new `docker info` call from this session reached the Linux engine pipe but returned `permission denied`. Engine readiness may have changed, but this session still cannot verify it. [S00-T11](../adr/compatibility-spike.md) separately records dependency research.
- No app, lockfile, service configuration, boot report or product test evidence exists yet. PL-01 is only at discovery; reproducible startup cannot be claimed.
- PL-03 has a stable task ID and an audit evidence path; the Project Co-owner accepted this scoped review on 2026-10-10. Other mapped tasks remain outstanding.
- Actual person-hours were not timed for this session; the 4 h task estimate is not recorded as effort.

No application command was attempted and no credentials or private production data were used. The next scoped task by index is S00-T11, subject to its readiness check.
