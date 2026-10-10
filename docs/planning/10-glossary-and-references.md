# Glossary and References

## Glossary

| Term | Meaning |
|---|---|
| CRDT | Replicated text state whose updates converge under duplication/reordering |
| Y.Doc / Y.Text | One canonical document and its source-text shared type per text file |
| Awareness | Ephemeral presence/cursor state, not durable source |
| Durable ACK | Acknowledgement covering updates committed to PostgreSQL |
| State vector | Yjs client-clock summary used to identify covered updates |
| Revision / manifest | Immutable consistent project tree, content hashes and compile settings |
| Checkpoint | Operation that freezes an immutable revision |
| Anchor | Relative Yjs position plus contextual fallback for comments/suggestions |
| Detached | Anchor cannot safely resolve to existing source |
| Trusted executor | Dedicated hardened runtime for trusted team-owned source |
| Isolated executor | Verified per-job security boundary for potentially hostile input |
| Gate / sprint | Verified release milestone / ordered work stage in this extracurricular plan |
| Ready / Done | Dependencies and contracts allow execution / actual acceptance and quality evidence exists |
| MoSCoW | Must, Should, Could, Won't relative to the named release scope |
| ADR | Architecture decision with context, alternatives, choice and consequences |
| IDOR / CSRF / SSRF | Unauthorized object access / forged cookie-authenticated action / unsafe server-side remote fetch |
| SyncTeX | Mapping between source positions and compiled PDF positions |
| Outbox | Transactional record for reliable event publication |

## Reference Policy

The links below are preserved from the original source, with English labels. They are research inputs, not fresh verification. Check official documentation, version compatibility, hosting limits and license/API terms when the relevant task begins. No external API is called and no package is installed by this planning change.

## Product References

- [Overleaf feature overview](https://www.overleaf.com/about/features-overview)
- [Editor interface](https://docs.overleaf.com/getting-started/how-do-i-use-overleaf/redesigned-overleaf-editor)
- [Reviewers](https://docs.overleaf.com/collaborating/reviewing-and-reviewers)
- [Track changes](https://docs.overleaf.com/collaborating/track-changes)
- [History and versions](https://docs.overleaf.com/writing-and-editing/history-and-versioning)
- [Editor/PDF layout](https://docs.overleaf.com/navigating-in-the-editor/working-with-the-pdf-viewer/editor-and-pdf-layout-and-sizing)
- [Reference managers](https://docs.overleaf.com/integrations-and-add-ons/reference-manager-integrations)
- [Git and GitHub integration](https://www.overleaf.com/learn/how-to/Git_Integration_and_GitHub_Synchronization)
- [Plan limits](https://docs.overleaf.com/getting-started/free-and-premium-plans/plan-limits)
- [Overleaf Community Edition and compile-isolation limitations](https://github.com/overleaf/overleaf)

## Hosting References

- [Railway WebSockets](https://docs.railway.com/guides/sse-vs-websockets)
- [Railway scaling](https://docs.railway.com/deployments/scaling)
- [Railway buckets](https://docs.railway.com/storage-buckets)
- [Railway upload guide](https://docs.railway.com/guides/storage-buckets-guide)
- [Railway volumes](https://docs.railway.com/volumes/reference)
- [Railway networking](https://docs.railway.com/networking/domains/working-with-domains)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Railway Redis](https://docs.railway.com/databases/redis)
- [Source-listed Vercel WebSocket announcement](https://vercel.com/changelog/websocket-support-is-now-in-public-beta)
- [Vercel WebSocket function guidance](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)

## Editing References

- [Yjs editor bindings](https://docs.yjs.dev/ecosystem/editor-bindings/codemirror)
- [CodeMirror 6 / Yjs binding](https://github.com/yjs/y-codemirror.next)
- [Hocuspocus server package](https://www.npmjs.com/package/@hocuspocus/server)
- [Hocuspocus Redis extension](https://www.npmjs.com/package/@hocuspocus/extension-redis)
- [unified-latex parser and macro limitations](https://github.com/siefkenj/unified-latex)
