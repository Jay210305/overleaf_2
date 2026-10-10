# Object Card Context

Inputs: [Schema](../_meta/schema.md), [generated index](_index.md), an actual owner/design source.
Process: follow one catalog route, read its card, inspect its cited source, and update direct impact when the source changes.
Outputs: authored object cards and a regenerated index via [Map Builder](../../../scripts/build_icm_map.py).
Human check: `verified` applies to inspected cited files; ghost paths remain design-only. Read the relevant card rather than the whole shelf.
