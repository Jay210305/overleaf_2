# Metrics and Non-functional Requirements

[Requirements](requirements.md) retains NFR-01–NFR-12 and their traceability. Values from the source are design targets measured in an explicitly recorded environment, not assertions about arbitrary internet or hosting conditions.

## Measurement Protocol

Record CPU/RAM allocation, client count, network topology, dataset, image digest, sample count and measurement interval with every performance result. Proposed load fixture: 100 projects, 20 nodes/project, representative text/binary sizes, 10/50/100 WS connection stages. Measure p50/p95/p99; publish the saturation point instead of extrapolating it.

| Objective | Threshold / check | Gate |
|---|---|---|
| Confirmed save durability | Zero acknowledged edits lost after crash/restart | G1 text; G2 concurrent text |
| CRDT convergence | Five clients, 1,000 edits each, exact final content equality | G2 |
| Role/session revocation | No accepted unauthorized mutation after authoritative revocation; sockets closed/restricted and new data withheld | G2; REST enforced in G1 |
| CRUD performance | p95 <=500 ms, excluding compilation, on recorded reference environment | G5 |
| Remote edit propagation | p95 <=300 ms on local test network | G2 |
| Compile provenance | Source revision ID and manifest hash equal frozen job inputs | G1 |
| Queue quotas | At most 1 active compile/user and 1 active compile/project initially | G1 |
| Accessibility | WCAG 2.2 AA target; zero serious/critical automated axe findings and manual keyboard review of delivered flows | Every gate |
| Backup recovery | DB and bucket restored, all referenced hashes resolve; proposed exercise at each release and every 30 days of hosted use | G1 release; automated G5 |
| Log privacy | Zero tokens/credentials/private manuscript text in logs | Every gate |
| Browser support | Delivered critical flows pass Chromium, Firefox and Edge; record versions | Every gate |
| Offline transparency | Pending local edits never silently discarded or labeled saved before durable ACK | G2; network error behavior in G1 |

## Telemetry

`api_request_duration`, `api_errors_total`, `collab_connections`, `collab_persist_lag`, `crdt_snapshot_size`, `compile_queue_depth`, `compile_duration`, `compile_failure_rate`, `storage_bytes`, `redis_memory`, `db_connections`, `job_retries`. Carry requestId/traceId browser→API→jobs; redact content and credentials.

Starting alert proposals: persisted-change lag >2 s for 60 s; oldest queued job >120 s; failed readiness for 60 s; any backup failure; usage >=80% of a configured operational quota. Tune to measured behavior with an ADR/config record. There is no fixed financial budget; if paid services are selected, contributors explicitly choose resource limits and monitoring then.
