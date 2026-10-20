import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as Y from "yjs";

// Presentation-only fixtures: these checks do not establish live collaboration or TeX output.
test("editor layout stays readable and preserves work across compact views", async ({ page }) => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const fileId = "22222222-2222-4222-8222-222222222222";
  const source =
    "\\documentclass{article}\n\\title{A new perspective}\n\\author{Your name}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\nGood ideas begin with a blank page.\n\n\\end{document}";
  const doc = new Y.Doc();
  doc.getText("content").insert(0, source);
  const text = {
    fileId,
    updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    stateVectorBase64: Buffer.from(Y.encodeStateVector(doc)).toString("base64"),
    persistedSeq: 1,
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: object = { items: [], nextCursor: null };
    if (path.endsWith(`/projects/${projectId}`))
      body = { id: projectId, title: "Minimal article", compiler: "pdflatex" };
    else if (path.endsWith("/nodes"))
      body = {
        treeVersion: 1,
        items: [
          {
            id: fileId,
            projectId,
            parentId: null,
            name: "main.tex",
            kind: "FILE",
            contentKind: "TEXT",
            mime: "application/x-tex",
            sizeBytes: source.length,
          },
        ],
      };
    else if (path.endsWith("/text")) body = text;
    else if (path.endsWith("/auth/session")) body = { displayName: "Layout reviewer" };
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/project/${projectId}`);
  await page.getByRole("treeitem", { name: "main.tex (file)" }).click();
  await expect(page.getByTestId("source-code")).toHaveText(source);
  await expect(page.getByLabel("Comment body")).toBeHidden();
  const iconSize = await page.getByTestId("mode-code-btn").locator("svg").boundingBox();
  expect(iconSize?.width).toBeLessThanOrEqual(18);
  await page.getByRole("button", { name: "Hide PDF" }).click();
  await expect(page.getByTestId("compile-button")).toBeVisible();
  await page.getByRole("button", { name: "Show PDF" }).click();
  await page.screenshot({ path: "test-results/editor-layout-desktop.png" });

  await page.getByText("Tools", { exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeHidden();

  await page.locator(".workspace-comments > summary").click();
  await page.getByLabel("Comment body").fill("Expand the introduction.");
  await page.locator(".workspace-comments > summary").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("source-code")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Project files", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(page.getByTestId("empty-pdf-message")).toBeVisible();
  await page.screenshot({ path: "test-results/editor-layout-mobile-pdf.png" });
  await page.getByRole("button", { name: "Editor", exact: true }).click();
  await expect(page.getByTestId("source-code")).toHaveText(source);
  await page.locator(".workspace-comments > summary").click();
  await expect(page.getByLabel("Comment body")).toHaveValue("Expand the introduction.");
  await page.locator(".workspace-comments > summary").click();
  await page.getByTestId("mode-visual-btn").click();
  await page.getByTestId("mode-code-btn").click();
  await expect(page.getByTestId("source-code")).toHaveText(source);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/editor-layout-mobile.png" });

  const audit = await new AxeBuilder({ page })
    .include(".project-workspace")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? "")),
  ).toEqual([]);
  doc.destroy();
});
