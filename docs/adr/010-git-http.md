# ADR-010 — Git Smart HTTP Implementation, Token Security, and Revision Mapping

**Status:** ACCEPTED

**Date:** 2026-10-17

**Context:** Requirement INT-06 and Sprint 14 (G4) require authenticated Git over HTTP, enabling real `git clone`, `git fetch`, and `git push` interactions from standard Git command-line clients and IDEs (VS Code, IntelliJ) independently from third-party hosts like GitHub. The system must enforce server-side authorization, provide revocable scoped tokens, protect repository paths from traversal, reject non-fast-forward pushes, and translate incoming commits into canonical Yjs mutations.

---

## 1. Protocol Architecture: Smart HTTP vs Dumb HTTP

Git supports two HTTP transfer protocols:
1. **Dumb HTTP:** Static file serving without server-side processing. Deprecated, inefficient, lacks fine-grained ACLs and cannot support dynamic commit translation.
2. **Smart HTTP (Selected):** RFC-compliant binary RPC negotiation over standard HTTP POST/GET endpoints:
   - `GET /git/{projectId}.git/info/refs?service=git-upload-pack`: Advertises available refs and capabilities for clone and fetch.
   - `POST /git/{projectId}.git/git-upload-pack`: Multiplexed packfile generation and negotiation for clone and fetch.
   - `GET /git/{projectId}.git/info/refs?service=git-receive-pack`: Advertises current ref tip for push operations.
   - `POST /git/{projectId}.git/git-receive-pack`: Receives ref updates and incoming packfile objects.

### Decision
The Git bridge service (`apps/git-bridge`) implements the Git Smart HTTP protocol version 1 and 2, using standard packet-line (`pkt-line`) framing and streaming packfiles.

---

## 2. Engine and Implementation Strategy

Three approaches were evaluated:

| Criterion | Native `git-http-backend` via Spawn | Pure JS/TS (`isomorphic-git`) | Custom Smart Protocol Stream Engine |
|---|---|---|---|
| **Security & Injection** | Risk of command injection if argv or env are dynamic. | Pure memory; no shell spawn. | Strict parser; no shell execution. |
| **Performance** | Fast C implementation, but high overhead per process fork. | Moderate JS execution speed. | High throughput streaming. |
| **Licensing** | GPL-2.0 runtime dependency; requires git installed on host. | MIT License; pure dependency. | MIT License; integrated codebase. |
| **CRDT / Yjs Alignment** | Requires disk checkout sync loop to DB. | Direct access to object graph in Node. | Direct translation between Git trees and Yjs documents. |

### Decision
`apps/git-bridge` utilizes a pure TypeScript smart protocol adapter and streaming engine:
- Evaluates incoming pkt-line frames directly without invoking unsandboxed shell commands.
- Repositories are addressed by UUID (`/git/:projectId.git`), preventing directory traversal (`../`).
- Translates project files and revisions directly to/from standard Git packfiles, trees, and commit objects.
- Does not expose arbitrary host filesystem access or general system binaries.

---

## 3. Authentication & Scoped Token Model (ACC-02, INT-06)

Git CLI tools authenticate via HTTP Basic Authentication (`Authorization: Basic <base64>`).
- **Username:** Account email or user handle.
- **Password:** Dedicated **Git Access Token** (Personal Access Token), never the user's raw account password.
- **Token Format:** Cryptographically random high-entropy token prefix `glc_git_<random32bytes>`.
- **Storage:** Only the SHA-256 hash of the token is stored in the database (`git_access_tokens` table).
- **Scoping & Expiration:** Tokens support explicit expiration dates and permission scopes:
  - `git:read`: Allows clone and fetch (`git-upload-pack`).
  - `git:write`: Allows push (`git-receive-pack`) in addition to read.
- **Revocation:** A user can revoke a token instantly. Revoked tokens are immediately rejected with HTTP 401 Unauthorized (`WWW-Authenticate: Basic realm="Git Bridge"`).
- **Session Exclusion:** Web session cookies and API secrets are never transmitted, requested, or leaked in Git bridge responses or headers.

---

## 4. Revision-to-Commit Mapping & Non-Fast-Forward Protection

Git history must seamlessly align with collaborative editor project revisions:
1. **Export Mapping (Editor -> Git):**
   - Each project revision manifest corresponds to a Git commit object.
   - The tree object mirrors the project node structure (`main.tex`, folders, images).
   - Commit metadata includes author display name, timestamp, and revision number (`revision_no`).
2. **Import Mapping (Git -> Editor):**
   - A `git push` arrives with a requested ref update: `<old-sha> <new-sha> refs/heads/main`.
   - **Fast-Forward Check:** The bridge verifies that `<old-sha>` matches the SHA of the project's current active revision tip.
   - If `<old-sha>` diverges or is stale:
     - The push is rejected with a non-fast-forward error (`[remote rejected] main -> main (non-fast-forward)`).
     - The user must `git pull` first, preventing destructive overwrite.
   - If `<old-sha>` matches:
     - The packfile is unpacked.
     - Changed text files are applied through canonical Yjs CRDT mutations rather than database row overwrite, emitting durable mutation events to live collaborative sessions.
     - A new project revision is committed and marked as sourced from Git.

---

## 5. Security Invariants

1. **Server-Side Authorization:** Every Git HTTP request evaluates project permissions:
   - `git-upload-pack` requires at least `VIEWER` permission on the project.
   - `git-receive-pack` requires at least `EDITOR` or `OWNER` permission.
2. **No Secret Leaks:** Git protocol responses and HTTP logs redact all tokens, auth headers, and passwords.
3. **No ZIP Fallback Equivalence:** ZIP archive download/upload is a static snapshot utility, not a Git repository interface. It cannot be substituted for Git HTTP compliance.
