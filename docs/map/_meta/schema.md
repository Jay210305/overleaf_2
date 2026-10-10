# Map Schema

Object frontmatter has `type: object`, `cluster`, `universe`, `status`, `entity`, `sources` (a JSON array of repository-relative file paths), and `runtime`.

- Universe: `live`, `leftover`, `ghost`.
- Status: `stub`, `verified`, `stale`.
- Runtime: `not-applicable`, `proposed`, `implemented`.
- A verified card also names `verified_on` and `snapshot: _meta/file-inventory.json`; source hashes in that snapshot identify its working revision.
- For live cards, `entity` must exist. For ghost cards, `entity` is the proposed path; existing design source files must still be cited. Never use `implemented` without inspecting runtime evidence.

Object sections: Summary, Why this shape, Shape, Connected to, If you change this (Hits / Does not hit), Surfaces, See.

Process frontmatter has `type: process`, `universe`, `status`, `sources`, `consumes`, `produces`, `verified_on` and `snapshot`. The first map contains only document-maintenance processes, not hypothetical application execution.

Process sections: Input → Movement → Output, Why this shape, Steps, If you change this, Surfaces, See. The generated object index summarizes cards, never duplicates source specifications. Folder contracts name inputs, process, outputs and a human check.
