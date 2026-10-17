# ADR-009 — Reference Providers, Bibliographic Synchronization, and API Access Terms

**Status:** ACCEPTED  
**Date:** 2026-10-16  
**Context:** Gate 4 (G4) and requirements INT-03, INT-04, and INT-07 require integrations with reference management platforms (Zotero, Mendeley, Papers / ReadCube) and cloud storage (Dropbox). The master plan specifies: *no provider is marked Done without authorized connectivity evidence; unpermitted or inaccessible providers must remain explicitly recorded as `BLOCKED_BY_PROVIDER` with zero fabricated parity claims.*

This Architectural Decision Record documents the findings of the reference provider research spike, evaluates current API access models, terms of service, and rate limits, and establishes the architectural rules for reference synchronization in the collaborative LaTeX editor.

---

## Provider Capability and Terms Matrix

| Provider | API Availability & Protocol | Authentication & Scopes | Terms of Service & Constraints | Status / Verdict |
|---|---|---|---|---|
| **Zotero** | **Web API v3** (REST, JSON, BibTeX export) | API Keys & OAuth 1.0a; scopes: `library:read`, `files:read`, `groups:read` | Community-governed (Corporation for Digital Scholarship); open access terms explicitly encourage third-party sync and citations. | **SUPPORTED** (Active implementation S13-T01, S13-T02) |
| **Mendeley** | **Elsevier Developer API** (Restricted REST) | OAuth 2.0; requires approved Elsevier Developer Application | Elsevier deprecated consumer desktop APIs (2020–2022). Standalone public API keys are restricted; Developer Terms forbid bulk extraction, mirroring, or synchronization without an enterprise institutional contract. | **BLOCKED_BY_PROVIDER** (Gated terms; no legitimate open consumer sync) |
| **Papers (ReadCube)** | **Proprietary Cloud Sync** (No public REST API) | None (Internal session tokens only) | Digital Science operates Papers as a closed SaaS ecosystem. No public developer API or open sync protocol is documented or offered to third-party editors. | **BLOCKED_BY_PROVIDER** (No public API exists) |
| **Dropbox** | **Dropbox API v2** (REST, Content API) | OAuth 2.0 with PKCE; scopes: `files.content.read`, `files.content.write` | Permissive developer API; supports chunked upload, download, metadata queries, and revision cursors. | **SUPPORTED** (Active implementation S13-T04, S13-T08) |
| **Crossref / OpenAlex** | **Public REST API** (Content negotiation) | Free open access; polite pool mailto header; no API key required for standard queries | CC0 public domain metadata; returns canonical BibTeX via HTTP `Accept: application/x-bibtex`. | **PERMITTED OPTIONAL PROVIDER** (Selected for S13-T07) |

---

## Detailed Findings

### 1. Zotero
- **API Model:** Zotero Web API v3 exposes user and group bibliographic libraries at `https://api.zotero.org/users/{userId}/items` and `https://api.zotero.org/groups/{groupId}/items`.
- **BibTeX Representation:** Requests specifying `format=bibtex` return formatted BibTeX entries directly. Item versions and library version headers (`Last-Modified-Version`) provide efficient cache validation.
- **Security & Privacy:** Server stores encrypted Zotero API tokens using AES-256-GCM. Plain tokens are never sent to browser bundles or logged.
- **Sync Boundary:** Linked Zotero libraries are projected as read-only `.bib` files in project file trees. Push operations to Zotero libraries are strictly prohibited to avoid corrupting user cloud databases.

### 2. Mendeley
- **API History & Current State:** Following Elsevier's transition to Mendeley Reference Manager, the legacy open consumer API was largely retired. Elsevier Developer Portal requires formal application approval with documented institutional sponsorship.
- **Terms Analysis:** Section 4 of Elsevier API Terms prohibits using the API to replicate Elsevier products or provide competing document management services.
- **Architectural Decision:** Per the project's integrity guidelines, we refuse to scrape private endpoints or fabricate adapter functionality. Mendeley integration is formally designated **`BLOCKED_BY_PROVIDER`**. Any user request to connect Mendeley returns `422 CAPABILITY_UNSUPPORTED` with explicit failure notice.

### 3. Papers (ReadCube)
- **API Analysis:** ReadCube / Papers by Digital Science has no public API for bibliographic extraction or synchronization. ReadCube utilizes private GraphQL/WebSocket endpoints with short-lived browser cookies tied to active browser sessions.
- **Architectural Decision:** Reverse-engineering private endpoints or asking users for master passwords violates security invariants and terms of service. Papers integration is formally designated **`BLOCKED_BY_PROVIDER`**.

### 4. Permitted Optional Reference Provider (OpenAlex / Crossref Resolver)
- **Open Standards Compliance:** Academic workflows frequently require resolving individual DOIs or bibliographic metadata into clean BibTeX without requiring a commercial account.
- **Implementation Choice for S13-T07:** An open reference provider adapter conforming to `ProviderAdapter` is implemented, allowing verified retrieval of BibTeX references from public open scholarly infrastructures (Crossref/OpenAlex) while keeping commercial walled gardens visibly blocked.

---

## Invariants & Design Decisions

1. **User Connection Ownership & Project Permission Separation:**
   - External connections belong exclusively to user accounts (stored in `external_connections`).
   - A project member cannot link another user's connection to a project.
   - Linking a connection to a project requires `EDIT` permission (`OWNER` or `EDITOR`). `VIEWER` and `REVIEWER` roles are strictly forbidden from modifying project integrations.

2. **Read-Only Linked Bibliographies & Conflict Protection:**
   - Linked external bibliographies are marked read-only.
   - When a user refreshes a linked `.bib` file, the system computes a line-level diff against existing contents.
   - If manual edits have been made to the local `.bib` file, the refresh halts and reports `status: 'conflict'` with the conflicting path, preventing silent data loss.

3. **No Phantom Parity:**
   - No mock adapter or fake `DONE` status is permissible for providers without legitimate, verifiable API access.
   - UI surfaces unpermitted providers with explicit `BLOCKED_BY_PROVIDER` badges and explanatory guidance.

4. **Cryptographic Protection of Credentials:**
   - All external access tokens and API keys are encrypted at rest using AES-256-GCM with distinct IVs.
   - Raw credentials never appear in API responses, Git history, test outputs, or application logs.
