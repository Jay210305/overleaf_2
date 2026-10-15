# Interface Contracts

**Contract version:** 3.0.0 | **Status:** Design baseline with independently verified runtime slices.

These contracts complete missing planning choices as explicit proposals. No hosting capability, sandbox primitive, provider permission, installed dependency, or passing test is asserted by writing them. Changes to an interface require synchronized consumers and producer tests; breaking changes require an ADR and MAJOR version.

| Contract | Producer / consumers | Implementation point |
|---|---|---|
| [HTTP API](http-api.md) / [OpenAPI](openapi.json) | API / browser, jobs where applicable | S01-T05 then feature routes |
| [Data Model](data-model.md) | DB adapter / API, collab, jobs | S01-T01/T02/T04/T09 |
| [Storage and Revisions](storage-and-revisions.md) | Storage/checkpoint service / uploads, compile, export, restore | S01-T08, S03-T07, S04-T07 |
| [Collaboration](collaboration.md) | Ticket API / collab, browser | S04 text baseline; S07 concurrent protocol |
| [Compilation](compilation.md) | Job service/executor / browser, storage | S06 trusted; S15 public |
| [Editing and Review](editing-and-review.md) | Text/review/parser service / code and visual UI | S09–S11 |
| [Integrations](integrations.md) | Provider/Git adapters / API, jobs, browser | S12–S14 |
| [Development Tooling](development-tooling.md) | Monorepo scripts/config / humans, CI, services | S00 |

Producer and consumer tests validate the same schema. Each task supplies its own assertion/fixture plus valid and invalid cases from the relevant contract. Interfaces are Ready only when prerequisites and any specified research/credentials are satisfied.
