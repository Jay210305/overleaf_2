# S00-T11 — Collaboration Dependency Compatibility Spike

**Observed:** 2026-10-10. **Status:** scoped candidate and blocker accepted by the Project Co-owner; no package installed or lockfile generated. **Task:** [S00-T11](../../implementation/sprint-00-bootstrap/S00-T11-check-editor-collaboration-dependency-compatibility.md). **Acceptance evidence:** [s00-t11.md](../test-reports/s00-t11.md#acceptance-review).

## Question and review checklist

Can a licensed Yjs 13, Hocuspocus and CodeMirror 6 set satisfy published peer and Node constraints for the proposed workspace? Check exact published versions, peer ranges, licenses, Node floor and an invalid alternative. Keep static metadata agreement separate from an actual frozen install and browser/server exercise.

## Published evidence

| Package / source | Verified metadata and implication |
|---|---|
| [Yjs `v13.6.27` manifest](https://github.com/yjs/yjs/blob/v13.6.27/package.json) and [license](https://github.com/yjs/yjs/blob/main/LICENSE) | Version `13.6.27`, MIT, Node `>=16`; within both binding and server Yjs 13 peer ranges. |
| [Hocuspocus server `v4.4.0` manifest](https://github.com/ueberdosis/hocuspocus/blob/v4.4.0/packages/server/package.json) and [v4 upgrade notes](https://github.com/ueberdosis/hocuspocus/blob/main/RELEASE_NOTES_V4.md) | MIT; peers `yjs: ^13.6.8` and `y-protocols: ^1.0.6`; Node `>=22`. The upgrade notes pair v4 server and provider, but provider `4.4.0` metadata was not fetched in this probe. |
| [`y-codemirror.next` `v0.3.5` manifest](https://github.com/yjs/y-codemirror.next/blob/v0.3.5/package.json) and [release](https://github.com/yjs/y-codemirror.next/releases/tag/v0.3.5) | MIT; peers `yjs: ^13.5.6`, `@codemirror/state: ^6.0.0`, `@codemirror/view: ^6.0.0`. This is the CodeMirror 6 binding for the Yjs 13 line. |
| [CodeMirror state manifest](https://github.com/codemirror/state/blob/main/package.json) and [view manifest](https://github.com/codemirror/view/blob/main/package.json) | MIT; state `6.6.0`, view `6.41.0`; view depends on state `^6.6.0`. These are version observations from archived upstream manifests, not an installed resolution. |

The published ranges have a nonempty intersection: Yjs `13.6.27` satisfies `^13.6.8` and `^13.5.6`; CodeMirror state `6.6.0` and view `6.41.0` satisfy the binding's `^6.0.0`, and view's state dependency accepts `6.6.0`. The host's Node `24.20.0` satisfies Hocuspocus server's `>=22` floor. This is a metadata inference, not a passing dependency resolution or runtime interoperability test.

## Candidate and decision boundary

Candidate exact direct versions for the future S00-T03 manifest: `yjs@13.6.27`, `@hocuspocus/server@4.4.0`, `y-codemirror.next@0.3.5`, `@codemirror/state@6.6.0`, `@codemirror/view@6.41.0`, and `y-protocols@1.0.6`. Use a matching `@hocuspocus/provider` v4 release after its exact package metadata and peer ranges are retrieved; `4.4.0` is a proposed pairing, **not yet verified**. The workspace still needs a pinned Node/pnpm choice and frozen lockfile. No dependency was added to this repository by this spike.

The rejected invalid combination is the [current `y-codemirror.next` main branch](https://github.com/yjs/y-codemirror.next/blob/main/package.json), now named `@y/codemirror` and peering on `@y/y` 14. It cannot establish compatibility with the planned Yjs 13 stack. Avoid mixing multiple resolved Yjs or CodeMirror state/view copies; inspect the eventual lockfile and run the editor/collaboration fixture before accepting a runtime claim.

## Remaining verification

- Fetch the exact Hocuspocus provider v4 manifest and `y-protocols@1.0.6` metadata/license from the package registry when network access permits. `npm view` in this workspace did not return before it was interrupted; official web manifests above supported the partial review.
- In S00-T03, pin the chosen set in manifests, generate and inspect the lockfile, and run a frozen install. In S07, test authenticated provider/server sync, reconnection and duplicate-package behavior. None was run in this research task.
- The Project Co-owner accepted the scoped S00-T01 and S00-T11 reviews on 2026-10-10. The exact provider metadata and runtime checks remain visible follow-ups in their owning tasks.
