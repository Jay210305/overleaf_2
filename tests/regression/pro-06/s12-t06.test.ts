import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { registerRevisionExportRoutes } from "../../../apps/api/src/modules/exports/routes.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

it("serves only the selected immutable build PDF and rejects a different job", async () => {
  const db = {
    query: vi.fn(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM project_revisions")) return { rows: [{ revision_no: "2" }] };
      if (sql.includes("FROM compile_jobs"))
        return {
          rows:
            args[0] === jobId
              ? [
                  {
                    status: "succeeded",
                    pdf_key: `projects/${projectId}/artifacts/${jobId}/output.pdf`,
                    log_key: null,
                    expires_at: null,
                  },
                ]
              : [],
        };
      return { rows: [] };
    }),
  };
  const storage = { getLimited: vi.fn(async () => Buffer.from("%PDF-1.7\ncompiled")) };
  const app = Fastify();
  app.decorateRequest("projectAuthorization", undefined);
  app.addHook("preHandler", async (request) => {
    request.projectAuthorization = { userId: projectId, role: "VIEWER" } as never;
  });
  registerRevisionExportRoutes(app, { db: db as never, storage: storage as never });
  const url = `/api/v1/projects/${projectId}/revisions/${revisionId}/exports/pdf?compileJobId=${jobId}`;
  const okay = await app.inject({ method: "GET", url });
  expect(okay.statusCode).toBe(200);
  expect(okay.headers["content-type"]).toContain("application/pdf");
  expect(okay.body).toContain("%PDF-");
  const denied = await app.inject({ method: "GET", url: url.replace(jobId, projectId) });
  expect(denied.statusCode).toBe(404);
  expect(storage.getLimited).toHaveBeenCalledOnce();
  await app.close();
});
