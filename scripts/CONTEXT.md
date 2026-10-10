# Documentation Tooling Context

## Inputs and Process

[plan_lint.py](plan_lint.py) reads planning/contracts/tasks and verifies structural consistency, original source hashes and planned API examples. [build_icm_map.py](build_icm_map.py) reads authored map cards/catalog and repository files, validates metadata/citations and regenerates designated map outputs. Neither script installs dependencies, uses the network or implements the product.

## Outputs

- `python scripts/build_icm_map.py`: regenerates map `AGENTS.md`, `routing.md`, `objects/_index.md` and `_meta/file-inventory.json`.
- `python scripts/build_icm_map.py --check`: read-only check of generated output freshness, metadata, local links and entry size.
- `python scripts/plan_lint.py`: documentation consistency report; no product test/build/deployment claim.

On this Windows host, a bundled Python exists at `C:/Users/jay21/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`. This is a local observation, not a portable project requirement; other maintainers can use their working Python.

## Human Check

Review changed cards against their sources before regeneration. The builder checks shape/hashes, not correctness of impact prose or test evidence. Run only the commands applicable to the authorized document change; [Development Tooling](../docs/contracts/development-tooling.md) owns future product commands.
