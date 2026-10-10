# Map Metadata Context

Inputs: [Schema](schema.md), repository files and current git baseline.
Process: [Map builder](../../../scripts/build_icm_map.py) classifies catalog/contract/factory/product paths and hashes the snapshot; no files are declared dead from apparent disuse.
Output: generated [File Inventory](file-inventory.json), excluding generated map indexes/twins to avoid circular hashes.
Human check: hashes identify inspected sources; missing external consumers and proposed paths remain explicit in [Map Context](../CONTEXT.md).
