import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { S3StorageAdapter } from "@latex-collab/storage";
import * as Y from "yjs";
import { createAuthenticatedContext } from "./authenticated-context.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);
const api = "http://127.0.0.1:3000/api/v1";
const origin = "http://127.0.0.1:5173";

test("two browser editors converge through the persistent collaboration socket", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${api}/health/ready`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 20_000 },
    )
    .toBe(200);
  const db = new DatabaseClient(config.DATABASE_URL);
  const storage = new S3StorageAdapter({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    bucket: config.S3_BUCKET,
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  });
  let imageKey: string | null = null;
  // Each editor gets its own session: reading a session rotates its token and
  // CSRF hash, so two contexts cannot share one stored session.
  const first = await createAuthenticatedContext(browser);
  const second = await createAuthenticatedContext(browser);
  const contexts = [first.context, second.context];
  try {
    const csrf = [first.csrf, second.csrf];

    const created = await contexts[0]!.request.post(`${api}/projects`, {
      headers: { origin, "x-csrf-token": csrf[0]! },
      data: { title: `Mixed Coediting ${randomUUID()}` },
    });
    expect(created.status()).toBe(201);
    const { id: projectId, mainFileId: fileId } = (await created.json()) as {
      id: string;
      mainFileId: string;
    };
    const initial = await contexts[0]!.request.get(
      `${api}/projects/${projectId}/files/${fileId}/text`,
      { headers: { origin } },
    );
    expect(initial.status()).toBe(200);
    const initialState = (await initial.json()) as {
      updateBase64: string;
      stateVectorBase64: string;
    };
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(initialState.updateBase64, "base64"));
    const source = doc.getText("content");
    source.delete(0, source.length);
    source.insert(
      0,
      [
        "\\section{Initial Title}",
        "First paragraph.",
        "\\begin{itemize}",
        "\\item Alpha",
        "\\end{itemize}",
        "\\[",
        "x+1",
        "\\]",
        "\\begin{tabular}{c}",
        "10 \\\\",
        "\\end{tabular}",
        "\\begin{figure}",
        "\\includegraphics{private.png}",
        "\\caption{Old Caption}",
        "\\label{fig:old}",
        "\\end{figure}",
        "\\mystery{preserve me}",
        "",
      ].join("\n"),
    );
    const seeded = await contexts[0]!.request.put(
      `${api}/projects/${projectId}/files/${fileId}/text`,
      {
        headers: { origin, "x-csrf-token": csrf[0]! },
        data: {
          updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
          baseStateVectorBase64: initialState.stateVectorBase64,
        },
      },
    );
    expect(seeded.status()).toBe(200);

    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(
      pages.map(async (page) => {
        await page.goto(`/project/${projectId}`);
        await page.getByRole("treeitem", { name: "main.tex (file)" }).click();
        await page.getByRole("button", { name: "Join live editor" }).click();
        await expect(page.getByTestId("live-save-status")).toHaveText("saved");
      }),
    );
    const [codePage, visualPage] = pages;
    await visualPage!.getByTestId("mode-visual-btn").click();
    await visualPage!.getByTestId("live-visual-document").getByText("Initial Title").click();
    await visualPage!.getByTestId("heading-input").fill("Shared Title");
    await visualPage!.getByTestId("heading-input").press("Enter");
    await expect(visualPage!.getByTestId("live-save-status")).toHaveText("saved");
    await expect(codePage!.locator(".cm-content")).toContainText("Shared Title");
    await expect(codePage!.locator(".cm-content")).toContainText("\\mystery{preserve me}");
    await expect(visualPage!.getByTestId("figure-asset-status")).toHaveText("Unverified Asset");

    imageKey = `projects/${projectId}/blobs/${randomUUID()}`;
    await storage.put(
      imageKey,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
        "base64",
      ),
      "image/png",
    );
    await db.query(
      `INSERT INTO project_nodes (project_id, name, kind, mime, content_kind, blob_key)
       VALUES ($1, 'private.png', 'FILE', 'image/png', 'BINARY', $2)`,
      [projectId, imageKey],
    );
    await visualPage!.getByTestId("mode-code-btn").click();
    await visualPage!.getByTestId("mode-visual-btn").click();
    await expect(visualPage!.getByTestId("figure-asset-status")).toHaveText("Asset Authorized");
    await expect(visualPage!.getByRole("img", { name: "private.png" })).toBeVisible();

    await visualPage!.getByTestId("live-visual-document").getByText("First paragraph.").click();
    await visualPage!.getByTestId("paragraph-textarea").fill("Changed paragraph.\n");
    await visualPage!.getByTestId("paragraph-textarea").blur();
    await visualPage!.getByTestId("live-visual-document").getByText("Alpha").click();
    await visualPage!.getByTestId("list-item-input").fill("Beta");
    await visualPage!.getByTestId("list-item-input").press("Enter");
    await visualPage!.getByTestId("math-preview").click();
    await visualPage!.getByTestId("math-textarea").fill("x+2");
    await visualPage!.getByTestId("math-textarea").blur();
    await visualPage!.getByTestId("table-cell-0-0").click();
    await visualPage!.getByTestId("table-cell-input").fill("20");
    await visualPage!.getByTestId("table-cell-input").press("Enter");
    await visualPage!.getByTestId("figure-caption").click();
    await visualPage!.getByTestId("figure-caption-input").fill("New Caption");
    await visualPage!.getByTestId("figure-caption-input").press("Enter");
    await expect(visualPage!.getByTestId("live-save-status")).toHaveText("saved");
    await expect(codePage!.locator(".cm-content")).toContainText("Changed paragraph.");
    await expect(codePage!.locator(".cm-content")).toContainText("\\item Beta");
    await expect(codePage!.locator(".cm-content")).toContainText("x+2");
    await expect(codePage!.locator(".cm-content")).toContainText("20 \\\\");
    await expect(codePage!.locator(".cm-content")).toContainText("\\caption{New Caption}");

    await codePage!.locator(".cm-content").click();
    await codePage!.keyboard.press("ControlOrMeta+End");
    await codePage!.keyboard.insertText("% code peer\n");
    await expect(codePage!.getByTestId("live-save-status")).toHaveText("saved");
    await visualPage!.getByTestId("mode-code-btn").click();
    await expect(visualPage!.locator(".cm-content")).toContainText("% code peer");

    const persisted = await contexts[0]!.request.get(
      `${api}/projects/${projectId}/files/${fileId}/text`,
      { headers: { origin } },
    );
    expect(persisted.status()).toBe(200);
    const state = (await persisted.json()) as { updateBase64: string };
    const savedDoc = new Y.Doc();
    Y.applyUpdate(savedDoc, Buffer.from(state.updateBase64, "base64"));
    expect(savedDoc.getText("content").toString()).toContain("\\section{Shared Title}");
    expect(savedDoc.getText("content").toString()).toContain("\\mystery{preserve me}");
    expect(savedDoc.getText("content").toString()).toContain("\\caption{New Caption}");
    expect(savedDoc.getText("content").toString()).toContain("% code peer");

    await visualPage!.getByTestId("mode-visual-btn").click();
    await visualPage!.getByTestId("live-visual-document").getByText("Shared Title").click();
    await visualPage!.getByTestId("heading-input").fill("Stale Title");
    await codePage!.locator(".cm-content").click();
    await codePage!.keyboard.press("ControlOrMeta+Home");
    await codePage!.keyboard.press("Shift+End");
    await codePage!.keyboard.insertText("\\section{Peer Title}");
    await expect(codePage!.getByTestId("live-save-status")).toHaveText("saved");
    await visualPage!.getByTestId("heading-input").press("Enter");
    await expect(visualPage!.getByRole("alert")).toContainText("source changed");
    await expect(codePage!.locator(".cm-content")).toContainText("\\section{Peer Title}");
    await expect(codePage!.locator(".cm-content")).not.toContainText("Stale Title");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    if (imageKey) await storage.delete(imageKey);
    await db.close();
  }
});
