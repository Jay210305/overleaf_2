import { expect, it, vi } from "vitest";
import { selectRevisionExport } from "../../apps/api/src/modules/exports/routes.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

it("selects a genuine PDF only from the requested project's frozen revision and compile job", async () => {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM project_revisions")) return { rows: [{ revision_no: "7" }] };
      if (sql.includes("FROM compile_jobs"))
        return {
          rows: [
            {
              status: "succeeded",
              pdf_key: `projects/${projectId}/artifacts/${jobId}/output.pdf`,
              log_key: null,
              expires_at: null,
            },
          ],
        };
      return { rows: [] };
    }),
  };
  const storage = { getLimited: vi.fn(async () => Buffer.from("%PDF-1.7\nreal output")) };
  const result = await selectRevisionExport(db as never, storage as never, {
    projectId,
    revisionId,
    kind: "pdf",
    compileJobId: jobId,
    actorId: projectId,
    role: "VIEWER",
  });
  expect(result.contentType).toBe("application/pdf");
  expect(result.bytes.toString()).toContain("%PDF-");
  expect(storage.getLimited).toHaveBeenCalledOnce();
});

it("denies source ZIP to viewers and rejects foreign or mismatched build artifacts", async () => {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("FROM project_revisions")) return { rows: [{ revision_no: "7" }] };
      return { rows: [] };
    }),
  };
  const storage = { getLimited: vi.fn() };
  await expect(
    selectRevisionExport(db as never, storage as never, {
      projectId,
      revisionId,
      kind: "source",
      actorId: projectId,
      role: "VIEWER",
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    selectRevisionExport(db as never, storage as never, {
      projectId,
      revisionId,
      kind: "pdf",
      compileJobId: jobId,
      actorId: projectId,
      role: "EDITOR",
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect(storage.getLimited).not.toHaveBeenCalled();
});
