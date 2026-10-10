# Editing, History and Review Contract

## Checkpoint and Restore

```ts
type RestoreInput = { revisionId: string; expectedRevision: number; fileId?: string };
type RestoreResult = { newRevisionId: string; revisionNo: number; changedNodeIds: string[]; detachedAnchorIds: string[] };
type SuggestionInput = { fileId: string; kind: 'insert' | 'delete' | 'replace';
  baseRevisionId: string; anchorStart: unknown; anchorEnd: unknown;
  oldTextHash: string; newText: string };
type VisualPatch = { fileId: string; start: number; end: number;
  expectedTextHash: string; replacement: string; baseStateVectorBase64: string };
```

Anchor values are validated serialized Y.RelativePosition objects with contextual selectedText/hash fallback, not arbitrary JSON passed through. Runtime validators restrict client/item/clock representation to valid Yjs positions. All mutation services take authenticated actor/project context from server session, not trust it in client payload.

Checkpoint on compile, user label, before/after import/restore/Git sync, and proposed idle autosnapshot thresholds (60s or 100 committed updates). Never one full project snapshot per keypress. Compare deterministic text diff per file, tree/rename/delete by IDs, binary by hashes. Display approximate author/time, changed files, labels and associated PDF revision.

Restore requires current permissions and expectedRevision; creates a new revision rather than erasing history. A selected-file restore does not modify other files. Source/config metadata changes are shown before confirmation; present owner/membership/session data remain unchanged. Historical comments remain readable under current permissions; no new comments on deleted files. Unresolvable anchors become detached.

## Suggestions and Comments

EDITING writes canonical Y.Text; REVIEWING submits independent suggested operations; VIEWING allows authorized read/awareness only. Suggestion carries author/date/base/relative anchors/old hash/new text/status. OWNER/EDITOR accept transactionally only when expected range is unambiguous; otherwise 409 SUGGESTION_CONFLICT and explicit reanchor workflow. Reject changes only proposal state. Acceptance is attributed/audited once and creates history. Bulk accept returns an explicit per-item result and never labels unapplied text accepted.

Comment creation/reply/resolve/reopen/delete checks role/ownership, bounded sanitized Markdown and current project membership. Mentions target only authorized recipients. Proposed comment/chat cap 10,000 UTF-8 characters; rate limit is configurable. Sanitize links/HTML; a malicious body is never trusted DOM.

## Visual Projection and Source Preservation

Research unified-latex API/license and precise range behavior before AST implementation. Canonical state remains LaTeX source. Supported nodes: paragraphs, headings, lists, bold/italic, links, compatible inline/display formulas, simple figures/tables, citations/refs. Map nodes to exact source regions. Apply minimal verified patches through canonical mutation; a concurrent fragment change triggers reparse or visible conflict.

`\\section{Introduction}` edits heading argument and preserves outside spacing/escapes. `\\textbf`/`\\emph` edit known argument only. Lists preserve items/comments; math may use code/dialog; image path is authorized; cite/ref chips resolve project keys. Unknown macros, nested unsupported constructions, complex preamble/redefinitions, verbatim and TikZ are literal/code fallback. KaTeX/MathJax preview applies only to compatible syntax; compiled PDF is final rendering authority.

## Valid and Invalid Examples

Valid: reviewer proposes A→B without changing canonical A; authorized editor accepts once and both clients observe B plus audit. Opening visual and returning to code without editing leaves all 100 fixture bytes identical.

Invalid: stale suggestion oldTextHash → 409 with unchanged source; reviewer direct WSS update → forbidden; restore stale expectedRevision → 409; deleted comment range → detached rather than wrong text; whole-document regeneration on a visual edit → fails localized-diff assertion.
