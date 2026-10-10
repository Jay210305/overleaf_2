# Release and Post-mortem

## Stabilization and Freeze

G1–G5 each have a stabilization task in the roadmap. Freeze new features for the declared scope; accept fixes/documentation. If findings exceed the reserve, add <=8 h tasks and continue without compressing estimates.

## Release Checklist

- [ ] Every current-gate Must has requirement → task → real test evidence.
- [ ] Applicable QG-01–QG-10 pass, with no unresolved critical security issue.
- [ ] Clean install, pinned build and migration succeed in a clean environment.
- [ ] Register/verify/login/create/edit/save/compile/genuine PDF/download smoke passes.
- [ ] Delivered browser, keyboard, permission, retry and failure journeys pass.
- [ ] DB and object backup/restore resolves all referenced hashes and key recovery instructions.
- [ ] Trust flags, cookies, domains, object URLs, provider scopes and redaction reviewed.
- [ ] README/quickstart, known limitations and runbooks updated.
- [ ] Last compatible image/artifact and DB expand/contract rollback identified and rehearsed.
- [ ] Both maintainers record release review; public signup separately requires verified isolation and explicit joint enablement approval.

## Changelog and Version

Use Keep a Changelog categories Added/Changed/Fixed/Removed/Security; reference task IDs and review by hand. Establish one product version source in package.json during bootstrap. MAJOR breaks a contract with an ADR, MINOR adds compatible features, PATCH fixes behavior; candidates use -rc.N. Create vX.Y.Z tags only after actual evidence.

## Packaging

Build browser and separate API/collab/jobs/executor images as applicable; pin tag/digest rather than only latest. Install/deploy in a clean environment and smoke-test real services/fixtures. Providers require authorized staging results. Accounts/domains/resources are contributor decisions at deployment; local reproducible delivery can precede hosted release.

## Debt and Unfinished Work

Review Technical Debt and Open Gaps before closure. Close with evidence, drop with reason or migrate with owner/location/effort/impact. Deferred IDs remain visible and are never marked Done. Record cuts and provider limitations in release notes.

## Post-mortem Template

Create docs/postmortem-vX.Y.Z.md after an actual release:

```markdown
# Release vX.Y.Z Post-mortem

## Estimated versus Actual

| Sprint | Estimated hours | Actual hours | Difference | Explanation |
|---|---|---|---|---|

## Applied Cuts and Unfinished Scope

Retained IDs, reasons, responsible owner and next-gate destination.

## What Worked and What Failed

Observed task/release evidence and contributor experience.

## Next-cycle Actions

Concrete task, owner, verification and buffer adjustment.
```

## Closure Gate

An actual release is reproducible, supported scope stated, rollback/restore verified, debt migrated and post-mortem archived. This planning migration closes no product release gate.
