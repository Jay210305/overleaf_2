import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import argon2 from "argon2";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import * as Y from "yjs";
import { parseVisualAst, type HeadingNode, type TableNode } from "@latex-collab/latex";
import { applyVisualPatch, createVisualPatch } from "@latex-collab/editor";
import { applyTableCellPatch } from "../../packages/editor/src/visual-academic-patch.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("Mixed Code/Visual Coediting E2E: Convergence and Invariant Preservation", async ({
  request,
}) => {
  test.setTimeout(60000);
  const db = new DatabaseClient(config.DATABASE_URL);

  const userEmail = `e2e-mixed-visual-${randomUUID()}@example.test`;
  const password = "correct-password-123";

  // 1. Backend health readiness
  await expect
    .poll(
      async () => {
        try {
          return (await fetch("http://127.0.0.1:3000/api/v1/health/ready")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);

  // 2. Seed test user
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const userRes = await db.query<{ id: string }>(
    `INSERT INTO users (email_normalized, display_name, password_hash, email_verified_at)
     VALUES ($1, 'Mixed Visual User', $2, NOW()) RETURNING id`,
    [userEmail, passwordHash],
  );
  expect(userRes.rows[0]?.id).toBeDefined();

  // 3. Authenticate
  const loginRes = await request.post("http://127.0.0.1:3000/api/v1/auth/login", {
    headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": "login-bootstrap" },
    data: { email: userEmail, password },
  });
  expect(loginRes.status()).toBe(200);
  const csrfToken = loginRes.headers()["x-csrf-token"] ?? "";

  // 4. Create project
  const createProjRes = await request.post("http://127.0.0.1:3000/api/v1/projects", {
    headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": csrfToken },
    data: { title: `Mixed Coediting Project ${randomUUID()}` },
  });
  expect(createProjRes.status()).toBe(201);
  const project = await createProjRes.json();
  const projectId = project.id;
  expect(projectId).toBeDefined();

  // 5. Simulate 2 concurrent clients on the canonical source:
  // Client A is in Code Mode; Client B is in Visual Mode
  const initialSource = `\\documentclass{article}
\\begin{document}
\\section{Initial Title}
First paragraph of introduction.

\\begin{tabular}{|l|r|}
  Alpha & 100 \\\\
\\end{tabular}
\\end{document}`;

  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const textA = docA.getText("content");
  const textB = docB.getText("content");

  textA.insert(0, initialSource);
  // Sync initial state from A to B
  const initialUpdate = Y.encodeStateAsUpdate(docA);
  Y.applyUpdate(docB, initialUpdate);
  expect(textB.toString()).toBe(initialSource);

  // Client B (Visual Mode): Edits heading "Initial Title" -> "Enhanced Collaborative Title"
  const astB = parseVisualAst(textB.toString());
  const headingB = astB.nodes.find((n) => n.kind === "heading") as HeadingNode;
  expect(headingB).toBeDefined();

  const patchB = createVisualPatch(
    "main.tex",
    headingB.titleRange.start,
    headingB.titleRange.end,
    headingB.title,
    "Enhanced Collaborative Title",
    docB
  );
  const resB = applyVisualPatch(textB, patchB);
  expect(resB.success).toBe(true);

  // Client A (Code Mode): Concurrently edits the tabular cell "100" -> "250"
  const astA = parseVisualAst(textA.toString());
  const tableA = astA.nodes.find((n) => n.kind === "table") as TableNode;
  expect(tableA).toBeDefined();

  const resA = applyTableCellPatch(textA, {
    fileId: "main.tex",
    tableNode: tableA,
    rowIndex: 0,
    colIndex: 1,
    newContent: "250",
    expectedCellHash: tableA.rows[0]?.cells[1]?.hash ?? "",
    baseDoc: docA,
  });
  expect(resA.success).toBe(true);

  // Sync bidirectional CRDT updates
  const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
  const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

  Y.applyUpdate(docA, updateB);
  Y.applyUpdate(docB, updateA);

  // Both clients MUST converge to 100% identical source
  expect(textA.toString()).toBe(textB.toString());
  const converged = textA.toString();

  // Assert both independent modifications are present and syntax remains valid
  expect(converged).toContain("Enhanced Collaborative Title");
  expect(converged).toContain("Alpha & 250 \\\\");
  expect(converged.startsWith("\\documentclass{article}")).toBe(true);
  expect(converged.endsWith("\\end{document}")).toBe(true);

  // Verify project stats endpoint works with project
  const statsRes = await request.get(`http://127.0.0.1:3000/api/v1/projects/${projectId}/statistics`, {
    headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": csrfToken },
  });
  expect(statsRes.status()).toBe(200);
});
