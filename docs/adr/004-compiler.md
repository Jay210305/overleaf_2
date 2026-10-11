# ADR-004 — Compiler Separation

**Context:** TeX is executable input with resource and exfiltration risks.
**Options:** Compile in API, dedicated trusted worker, or per-job verified public isolation.
**Decision:** Separate orchestration and CompilerExecutor. G1 uses only trusted team documents in a hardened dedicated runtime. G5 needs demonstrable network/filesystem/process/resource isolation, potentially outside Railway.
**Consequences:** Shell escape disabled but insufficient alone; no API/DB secrets in runtime; public and untrusted flags stay false until verified. Public isolation availability is unresolved research, so G5 is conditional.

## S00 implementation evidence

No executor, jobs or compile routes exist yet. Configuration fails closed if public/untrusted flags are enabled; trusted_worker is the only accepted S00 profile. Genuine compilation and executor resource evidence remain S06/G5 work.

Sources: [decision baseline](../planning/09-decisions.md), [S00 verification](../test-reports/s00-verification.md).
