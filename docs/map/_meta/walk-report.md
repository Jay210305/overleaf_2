# Initial Map Review

**Date:** 2026-10-10. **Scope:** additive agent setup, skill research and documentation mapping. Product implementation remains unverified.

## Cold Walks

| Question | Observed route | Result |
|---|---|---|
| What owns durable save? | Root AGENTS → map catalog → API/Durable Data card → collaboration contract | Owner found; transaction commit before ACK and pending/saved distinction confirmed in cited design. Runtime remains `ghost`. |
| Which skill applies to a frontend task? | Root AGENTS → Skill Catalog → React/Currents entries | Upstream source, stage fit, Vite limitations and uninstalled status are explicit. |
| Where does stage evidence live? | S07 CONTEXT → selected task and S07 progress | Exact input/output paths resolve; stage folder is not completion evidence. |
| What moves after a contract change? | Effects catalog → Interface Contracts/Task Library cards | Direct design surfaces identified; original source documents remain provenance. |

## Structural Evidence

Observed `build_icm_map.py --check`: PASS; 10 object cards (6 live, 4 ghost), 2 documentation processes. Observed `plan_lint.py`: PASS; 183 tasks, 93 requirements, 16 stages, 1,320 task hours; original sources/IDs preserved and 120 planned HTTP operations checked.

The working-file inventory records source SHA-256 and the git baseline. Rebuild/check it after this report or any other source edit. The source catalog generates byte-identical map AGENTS/routing twins; root AGENTS is 38 lines.

## Limits

No external skills installed; no application tests, build, compiler execution, deployment or isolation audit performed. External path consumers remain unknown. The builder validates metadata, paths and hashes; impact prose was reviewed through these scoped walks, not proven by automated runtime analysis.
