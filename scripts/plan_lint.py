"""Validate the Markdown planning package without application dependencies.

Checks document structure, effort reconciliation, indexes, requirement/source
coverage, dependency cycles, local links, and planned HTTP schema examples.
This is a documentation check; it never claims product tests have passed.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
errors: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def front_matter(body: str) -> dict:
    result = {}
    match = re.match(r"\A---\n(.*?)\n---\n", body, re.S)
    if not match:
        raise ValueError("missing YAML front matter")
    for line in match[1].splitlines():
        key, value = line.split(":", 1)
        value = value.strip()
        if value.startswith("["):
            result[key] = [v.strip().strip('"') for v in value[1:-1].split(",") if v.strip()]
        elif value.isdigit():
            result[key] = int(value)
        elif value.startswith('"'):
            result[key] = json.loads(value)
        else:
            result[key] = value
    return result


def table_rows(body: str) -> list[list[str]]:
    return [[part.strip() for part in line.strip().strip("|").split("|")]
            for line in body.splitlines() if line.startswith("| ")]


def schema_accepts(value, schema: dict, models: dict) -> bool:
    """Validate the JSON-schema subset used by this self-contained baseline."""
    if "$ref" in schema:
        name = schema["$ref"].split("/")[-1]
        return name in models and schema_accepts(value, models[name], models)
    if "const" in schema and value != schema["const"]:
        return False
    if "enum" in schema and value not in schema["enum"]:
        return False
    if "oneOf" in schema and sum(schema_accepts(value, s, models) for s in schema["oneOf"]) != 1:
        return False
    if "anyOf" in schema and not any(schema_accepts(value, s, models) for s in schema["anyOf"]):
        return False
    kind = schema.get("type")
    valid_type = {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "null": value is None,
    }
    if kind and not valid_type.get(kind, False):
        return False
    if isinstance(value, dict):
        if any(key not in value for key in schema.get("required", [])):
            return False
        if len(value) < schema.get("minProperties", 0):
            return False
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in props and not schema_accepts(item, props[key], models):
                return False
            if key not in props and extra is False:
                return False
            if key not in props and isinstance(extra, dict) and not schema_accepts(item, extra, models):
                return False
    if isinstance(value, list):
        if not schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", float("inf")):
            return False
        if "items" in schema and not all(schema_accepts(item, schema["items"], models) for item in value):
            return False
    if isinstance(value, str):
        if not schema.get("minLength", 0) <= len(value) <= schema.get("maxLength", float("inf")):
            return False
        if "pattern" in schema and not re.search(schema["pattern"], value):
            return False
        try:
            if schema.get("format") == "uuid":
                UUID(value)
            elif schema.get("format") == "date-time":
                datetime.fromisoformat(value.replace("Z", "+00:00"))
            elif schema.get("format") == "email" and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
                return False
            elif schema.get("format") == "uri" and not urlparse(value).scheme:
                return False
        except ValueError:
            return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if not schema.get("minimum", -float("inf")) <= value <= schema.get("maximum", float("inf")):
            return False
    return True


def main() -> int:
    tasks = {}
    required_headers = ["Purpose", "Preconditions", "Interface Contract", "Essential Sub-tasks",
                        "Deliverables", "Acceptance Criteria", "Verification", "Edge Cases & Pitfalls",
                        "Risks / Scope Cuts", "Definition of Done"]
    for file in sorted((ROOT / "implementation").glob("sprint-*/S[0-9][0-9]-T*.md")):
        body = file.read_text(encoding="utf-8")
        try:
            metadata = front_matter(body)
            task_id = metadata["id"]
            check(task_id not in tasks, f"Duplicate task ID {task_id}")
            check(bool(re.fullmatch(r"S\d{2}-T\d{2}", task_id)), f"Invalid ID {task_id}")
            check(file.name.startswith(task_id + "-"), f"Filename/front-matter mismatch: {file}")
            check(int(task_id[1:3]) == metadata["sprint"], f"Sprint mismatch: {task_id}")
            for field in ["owner", "effort_h", "depends_on", "requirements", "source_task", "status"]:
                check(field in metadata, f"Missing {field}: {task_id}")
            check(0 < metadata["effort_h"] <= 8, f"Task exceeds size limit: {task_id}")
            check(metadata["status"] in {"todo", "in_progress", "done", "blocked"}, f"Invalid status: {task_id}")
            check(all(f"## {heading}\n" in body for heading in required_headers), f"Missing template section: {task_id}")
            steps = re.findall(r"^\| \d+\.\d+ \| ([0-9.]+) \|", body, re.M)
            check(bool(steps), f"No atomic steps: {task_id}")
            check(all(0 < float(hours) <= 2 for hours in steps), f"Sub-task exceeds 2h: {task_id}")
            check(sum(map(float, steps)) == metadata["effort_h"], f"Sub-task effort mismatch: {task_id}")
            tasks[task_id] = {**metadata, "file": file, "body": body}
        except (ValueError, KeyError, TypeError) as exc:
            errors.append(f"Malformed task {file}: {exc}")

    index_list = [r for r in table_rows(read("implementation/README.md"))
                  if re.fullmatch(r"S\d{2}-T\d{2}", r[0])]
    index_rows = {r[0]: r for r in index_list}
    check(len(index_list) == len(index_rows), "Duplicate task IDs in implementation index")
    check(set(index_rows) == set(tasks), "Task index membership mismatch")
    roadmap = read("docs/planning/04-implementation-roadmap.md")
    roadmap_rows = {}
    for row in table_rows(roadmap):
        match = re.match(r"\[(S\d{2}-T\d{2})\]\(([^)]+)\)", row[0])
        if match:
            check(match[1] not in roadmap_rows, f"Duplicate roadmap ID {match[1]}")
            roadmap_rows[match[1]] = row
    check(set(roadmap_rows) == set(tasks), "Roadmap/task membership mismatch")
    for task_id, task in tasks.items():
        for dependency in task["depends_on"]:
            check(dependency in tasks, f"Missing dependency {dependency} of {task_id}")
        if task_id in index_rows:
            row = index_rows[task_id]
            check(int(row[3]) == task["effort_h"], f"Index effort mismatch: {task_id}")
            check(row[2] == task["owner"] + " (proposed)", f"Index owner mismatch: {task_id}")
            check(row[4] == task["status"], f"Index status mismatch: {task_id}")
            target = re.search(r"\]\(([^)]+)\)", row[1])
            check(target is not None and (ROOT / "implementation" / target[1]).resolve() == task["file"].resolve(),
                  f"Index file mismatch: {task_id}")
        if task_id in roadmap_rows:
            row = roadmap_rows[task_id]
            check(int(row[2]) == task["effort_h"], f"Roadmap effort mismatch: {task_id}")
            check(row[3] == task["owner"], f"Roadmap owner mismatch: {task_id}")
            check(row[4].endswith(task["status"]), f"Roadmap status mismatch: {task_id}")
            check(row[5] in task["body"], f"Roadmap acceptance not copied to task: {task_id}")

    visited, visiting = set(), set()

    def visit(task_id: str) -> None:
        if task_id in visiting:
            errors.append(f"Dependency cycle at {task_id}")
            return
        if task_id in visited or task_id not in tasks:
            return
        visiting.add(task_id)
        for dependency in tasks[task_id]["depends_on"]:
            visit(dependency)
        visiting.remove(task_id)
        visited.add(task_id)

    for task_id in tasks:
        visit(task_id)

    sprint_blocks = list(re.finditer(r"^## Sprint (S\d{2}):.*?\n\n\*\*Duration:\*\*.*?\*\*Effort:\*\* (\d+) h.*?\*\*Owner:\*\* (.*?) \(proposed A-02\)", roadmap, re.M))
    check(len(sprint_blocks) == 16 and {m[1] for m in sprint_blocks} == {f"S{n:02d}" for n in range(16)},
          "Missing or duplicate sprint metadata blocks")
    for match in sprint_blocks:
        sprint_id, hours, owner = match.groups()
        members = [t for task_id, t in tasks.items() if task_id.startswith(sprint_id + "-")]
        check(sum(t["effort_h"] for t in members) == int(hours), f"Sprint effort mismatch {sprint_id}")
        check(all(t["owner"] == owner for t in members), f"More than one accountable sprint owner: {sprint_id}")
        progress = read(f"docs/progress/sprint-{sprint_id[1:]}.md")
        check({t["id"] for t in members} == set(re.findall(r"^\| \[(S\d{2}-T\d{2})\]", progress, re.M)),
              f"Progress task membership mismatch: {sprint_id}")
    total = sum(t["effort_h"] for t in tasks.values())
    for label, expected in [("Planned task effort", total), ("Uncertainty allowance (15%)", (total * 15 + 99) // 100),
                            ("Total reference effort", total + (total * 15 + 99) // 100)]:
        match = re.search(r"^\| " + re.escape(label) + r" \| (\d+) \|", roadmap, re.M)
        check(match is not None and int(match[1]) == expected, f"Reconciliation mismatch: {label}")

    requirement_rows = [r for r in table_rows(read("docs/planning/requirements.md"))
                        if re.fullmatch(r"(?:ACC|PRO|EDT|CMP|COL|INT|NFR|PL)-\d{2}", r[0])]
    requirements = {r[0] for r in requirement_rows}
    check(len(requirement_rows) == len(requirements), "Duplicate requirement IDs")
    check(all(r[2] in {"Must", "Should", "Could", "Won't"} and r[3] in {f"G{n}" for n in range(1, 6)}
              for r in requirement_rows), "Requirement without valid MoSCoW/gate")
    mapped = {req for task in tasks.values() for req in task["requirements"]}
    check(mapped == requirements, f"Requirement coverage mismatch: {sorted(mapped ^ requirements)}")
    trace_rows = {r[0]: r for r in table_rows(read("docs/planning/traceability.md")) if r[0] in requirements}
    parity_rows = {r[0]: r for r in table_rows(read("docs/feature-parity.md")) if r[0] in requirements}
    check(set(trace_rows) == requirements, "Traceability requirement membership mismatch")
    check(set(parity_rows) == requirements, "Feature evidence membership mismatch")
    for req in requirements:
        expected = {tid for tid, task in tasks.items() if req in task["requirements"]}
        actual = set(re.findall(r"\[(S\d{2}-T\d{2})\]", trace_rows.get(req, ["", ""])[1]))
        check(expected == actual, f"Traceability task mismatch: {req}")
        check(bool(trace_rows.get(req, ["", "", ""])[2]), f"No planned verification: {req}")

    manifest = json.loads(read("docs/planning/source-manifest.json"))
    for filename, digest in manifest["sources"].items():
        check(hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() == digest, f"Original source modified: {filename}")
    check(set(manifest["original_task_ids"]) <= set(tasks), "Lost original task IDs")
    check(all(t["source_task"] in manifest["original_task_ids"] for t in tasks.values()), "Unknown source task reference")
    check(set(manifest["original_feature_ids"] + manifest["original_nfr_ids"]) <= requirements, "Lost source requirement IDs")
    scenarios = read("docs/planning/test-scenarios.md")
    check(set(manifest["original_journey_ids"]) == set(re.findall(r"^\| (E2E-\d{3}) \|", scenarios, re.M)), "Lost E2E IDs")

    doc_files = [ROOT / "README.md", ROOT / "AGENTS.md", ROOT / "CONTEXT.md", *(ROOT / "docs").rglob("*.md"), *(ROOT / "implementation").rglob("*.md"), *(ROOT / "scripts").glob("*.md")]
    for file in doc_files:
        body = re.sub(r"```.*?```", "", file.read_text(encoding="utf-8"), flags=re.S)
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", body):
            target = unquote(target.split("#", 1)[0].strip("<>"))
            if not target or re.match(r"^[a-z]+:", target, re.I):
                continue
            resolved = (file.parent / target).resolve()
            check(resolved.is_relative_to(ROOT.resolve()), f"Out-of-workspace link {file}: {target}")
            check(resolved.exists(), f"Broken local link {file.relative_to(ROOT)}: {target}")
    for number in range(11):
        check(len(list((ROOT / "docs/planning").glob(f"{number:02d}-*.md"))) == 1, f"Missing/duplicate numbered doc {number:02d}")

    api = json.loads(read("docs/contracts/openapi.json"))
    models = api["components"]["schemas"]

    def refs(value) -> None:
        if isinstance(value, dict):
            if "$ref" in value:
                parts = value["$ref"].split("/")
                check(len(parts) == 4 and parts[:2] == ["#", "components"]
                      and parts[2] in {"schemas", "responses"}
                      and parts[3] in api["components"].get(parts[2], {}),
                      f"Broken contract reference: {value['$ref']}")
            for item in value.values():
                refs(item)
        elif isinstance(value, list):
            for item in value:
                refs(item)

    refs(api)
    operations = 0
    for route, methods in api["paths"].items():
        for method, operation in methods.items():
            operations += 1
            check("x-invalid-example" in operation, f"No invalid-case contract: {method} {route}")
            for parameter in operation.get("parameters", []):
                if "example" in parameter:
                    check(schema_accepts(parameter["example"], parameter["schema"], models), f"Invalid parameter example: {method} {route}")
            if "requestBody" in operation:
                content = operation["requestBody"]["content"]["application/json"]
                check(schema_accepts(content["examples"]["valid"]["value"], content["schema"], models), f"Invalid positive body example: {method} {route}")
                check(not schema_accepts(content["examples"]["invalid"]["value"], content["schema"], models), f"Negative body unexpectedly valid: {method} {route}")
            for status, response in operation["responses"].items():
                if "$ref" in response:
                    response = api["components"]["responses"][response["$ref"].split("/")[-1]]
                for content in response.get("content", {}).values():
                    if "example" in content:
                        check(schema_accepts(content["example"], content["schema"], models), f"Invalid response example: {method} {route} {status}")
    if errors:
        print("PLAN LINT FAIL")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"PLAN LINT PASS: {len(tasks)} tasks; {len(requirements)} requirements; 16 stages; {total} task hours.")
    print(f"Sources unchanged; 139 original tasks, 74 features, 12 NFRs and 30 E2E IDs preserved.")
    print(f"Atomic effort/index/roadmap totals, dependency DAG, local links and {operations} planned HTTP operations checked.")
    print("Product tests/build/deployment NOT_RUN; this verifies planning artifacts only.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, TypeError, IndexError) as exc:
        print(f"PLAN LINT FAIL: malformed or unavailable artifact: {exc}")
        sys.exit(1)
