# ADR-001 — Web and Server Stack

**Context:** Two contributors need a typed, reproducible academic web workspace.
**Options:** A single hosted app, a separated TypeScript monorepo, or adopting an existing licensed platform.
**Decision:** React/Vite/TypeScript, React Router, Fastify, pnpm/Turborepo, Drizzle/Postgres; TanStack Query for server data and local React state for UI. Introduce Zustand only with demonstrated need. Vercel/Railway remain proposed hosting choices; start locally.
**Consequences:** Explicit cross-service contracts and deployments; no automatic AGPL code reuse; pin the chosen compatible toolchain during S00.

## S00 implementation evidence

Node 24.21.0/pnpm 11.25.0 are pinned. React 19.3.0/Vite 8.3.4, Fastify 5.12.5, Zod 4.6.5 and TanStack Query 5.104.1 are installed. Native accessible HTML/CSS implements the small shell; advanced UI/editor dependencies remain future scope. Root builds all current packages and apps; shared config exports browser-safe and server-only entry points.

Sources: [decision baseline](../planning/09-decisions.md), [S00 verification](../test-reports/s00-verification.md).
