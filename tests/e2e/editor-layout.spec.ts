import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as Y from "yjs";

// Presentation-only fixtures: these checks do not establish live collaboration or TeX output.
const projectId = "11111111-1111-4111-8111-111111111111";
const fileId = "22222222-2222-4222-8222-222222222222";
const source =
  "\\documentclass{article}\n\\title{A new perspective}\n\\author{Your name}\n\n\\begin{document}\n\\maketitle\n\n\\section{Introduction}\nGood ideas begin with a blank page.\n\n\\end{document}";

async function openFixtureWorkspace(page: Page): Promise<Y.Doc> {
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
  await page.goto(`/project/${projectId}`);
  await page.getByRole("treeitem", { name: "main.tex (file)" }).click();
  await expect(page.getByTestId("source-code")).toHaveText(source);
  return doc;
}

test("editor layout stays readable and preserves work across compact views", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const doc = await openFixtureWorkspace(page);
  await expect(page.getByLabel("Comment body")).toBeHidden();
  const iconSize = await page.getByTestId("mode-code-btn").locator("svg").boundingBox();
  expect(iconSize?.width).toBeLessThanOrEqual(18);
  await page.getByTestId("view-mode-editor").click();
  await expect(page.getByTestId("compile-button")).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "PDF Preview and Compilation" }),
  ).toBeHidden();
  await page.getByTestId("view-mode-split").click();
  await page.getByRole("separator", { name: "Resize editor and PDF panes" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("source-code")).toBeVisible();
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
  await page.getByTestId("view-mode-pdf").click();
  await expect(page.getByTestId("empty-pdf-message")).toBeVisible();
  await page.screenshot({ path: "test-results/editor-layout-mobile-pdf.png" });
  await page.getByTestId("view-mode-editor").click();
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

test("file sidebar never covers the panes or the header controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const doc = await openFixtureWorkspace(page);
  await page.getByTestId("view-mode-split").click();

  // Splitter ratio applies to the pane area, not to the whole layout including the sidebar.
  const desktop = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, top: rect.top };
    };
    return {
      sidebar: box(".workspace-sidebar"),
      editor: box(".workspace-editor"),
      pdf: box(".workspace-pdf-pane"),
      panes: box(".workspace-panes"),
      header: box(".workspace-header"),
    };
  });
  expect(desktop.sidebar.right).toBeLessThanOrEqual(desktop.editor.left + 1);
  expect(desktop.editor.width / desktop.panes.width).toBeCloseTo(0.52, 1);

  // Above the drawer breakpoint the sidebar keeps its own column instead of overlapping.
  await page.setViewportSize({ width: 860, height: 800 });
  const medium = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, top: rect.top };
    };
    return {
      sidebar: box(".workspace-sidebar"),
      editor: box(".workspace-editor"),
      pdf: box(".workspace-pdf-pane"),
      panes: box(".workspace-panes"),
      header: box(".workspace-header"),
    };
  });
  expect(medium.sidebar.right).toBeLessThanOrEqual(medium.editor.left + 1);
  expect(medium.editor.width / medium.panes.width).toBeCloseTo(0.52, 1);
  expect(medium.pdf.width).toBeGreaterThan(240);

  // Below the breakpoint the sidebar is a drawer that starts under the header, so the
  // toggle and the layout switch stay reachable while it is open.
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(
    page.getByRole("complementary", { name: "Project files", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(
    page.getByRole("complementary", { name: "Project files", exact: true }),
  ).toBeVisible();
  const compact = await page.evaluate(() => {
    const header = document.querySelector(".workspace-header")!.getBoundingClientRect();
    const sidebar = document.querySelector(".workspace-sidebar")!.getBoundingClientRect();
    const toggle = document.querySelector(".ws-sidebar-toggle")!.getBoundingClientRect();
    return {
      headerBottom: header.bottom,
      sidebarTop: sidebar.top,
      sidebarWidth: sidebar.width,
      toggleTop: toggle.top,
      toggleBottom: toggle.bottom,
    };
  });
  expect(compact.sidebarTop).toBeGreaterThanOrEqual(compact.toggleBottom - 1);
  expect(compact.sidebarTop).toBeGreaterThanOrEqual(compact.headerBottom - 1);
  expect(compact.sidebarWidth).toBeGreaterThanOrEqual(220);
  expect(compact.toggleTop).toBeLessThan(compact.sidebarTop);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(
    page.getByRole("complementary", { name: "Project files", exact: true }),
  ).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  doc.destroy();
});
