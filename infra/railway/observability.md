# Observability, Telemetry, and Alerting Specification (S15-T07)

**Requirements:** NFR-10, NFR-04
**Deployment Target:** Multi-replica Railway / Hosted Container Architecture

## 1. Trace and Correlation Propagation
- **Headers:** `x-request-id` and `x-trace-id` are generated at ingress (or preserved if injected by upstream CDN/load balancer) and propagated across Fastify HTTP requests, Collab WebSockets, and background asynchronous jobs (`jobs/src/queue`).
- **Span Context:** Every log entry emitted across services includes `reqId` / `traceId` matching the caller request.

## 2. Privacy-Preserving Logging Guarantees (NFR-10)
- **Zero Content In Logs:** User manuscript files (`.tex`, `.bib`, images, raw text) and durable Yjs delta buffers are never recorded in application logs, APM traces, or error dumps.
- **Header & Token Masking:** Fastify Pino logger serializes headers through redaction paths:
  - `cookie`, `set-cookie`, `authorization`, `x-csrf-token` -> `[REDACTED]`
  - `password`, `token`, `otp` -> `[REDACTED]`
  - Error stacks redact user manuscript strings.

## 3. Core Alert Conditions & Trigger Rules
1. **QUEUE_LAG_HIGH (Warning):**
   - Condition: BullMQ / Job execution wait time > 5000 ms.
   - Action: Scale compilation worker replicas.
2. **QUEUE_DEPTH_EXCEEDED (Critical):**
   - Condition: Unprocessed compilation jobs in queue > 50.
   - Action: Alert on-call; throttle non-priority compiles with 429 backoff.
3. **BACKUP_UNHEALTHY (Critical):**
   - Condition: Automated daily backup failure or hash verification mismatch.
   - Action: Immediate page; block risky schema updates.
4. **ERROR_RATE_ELEVATED (Warning):**
   - Condition: HTTP 5xx responses exceed 5% of total requests over a 5-minute rolling window.
   - Action: Check container memory, database connection pool exhaustion.
