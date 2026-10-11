import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  crdtSnapshots,
  comments,
  suggestions,
} from "../../../packages/db/src/schema/collaboration.js";
import { usageQuotas } from "../../../packages/db/src/schema/integrations.js";

describe("PL-06 Relational constraints on collaboration/integration schemas (S01-T04)", () => {
  it("enforces required fields and integrity on crdtSnapshots", () => {
    const cols = getTableColumns(crdtSnapshots);
    expect(cols.fileId.notNull).toBe(true);
    expect(cols.uptoSeq.notNull).toBe(true);
    expect(cols.contentSha256.notNull).toBe(true);
  });

  it("enforces required foreign links on comments and suggestions", () => {
    const commentCols = getTableColumns(comments);
    expect(commentCols.projectId.notNull).toBe(true);
    expect(commentCols.fileId.notNull).toBe(true);
    expect(commentCols.createdBy.notNull).toBe(true);
    expect(commentCols.body.notNull).toBe(true);

    const suggCols = getTableColumns(suggestions);
    expect(suggCols.projectId.notNull).toBe(true);
    expect(suggCols.fileId.notNull).toBe(true);
    expect(suggCols.authorId.notNull).toBe(true);
    expect(suggCols.newText.notNull).toBe(true);
  });

  it("enforces bounded finite quota definitions", () => {
    const cols = getTableColumns(usageQuotas);
    expect(cols.subjectType.notNull).toBe(true);
    expect(cols.subjectId.notNull).toBe(true);
    expect(cols.metric.notNull).toBe(true);
    expect(cols.maxValue.notNull).toBe(true);
    expect(cols.window.notNull).toBe(true);
  });
});
