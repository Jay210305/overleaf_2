import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { registerRevisionExportRoutes } from "../../../apps/api/src/modules/exports/routes.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

it("makes an expiring link for one PDF and rechecks current authorization on read", async () => {
  let role = "EDITOR";
  let link: {
    id: string;
    projectId: string;
    revisionId: string;
    jobId: string;
    kind: string;
    expiresAt: Date;
  } | null = null;
  const db = {
    query: vi.fn(async (sql: string, args: unknown[]) => {
      if (sql.includes("FROM project_revisions")) return { rows: [{ revision_no: "2" }] };
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
      if (sql.includes("INSERT INTO revision_export_links")) {
        link = {
          id: args[0] as string,
          projectId: args[1] as string,
          revisionId: args[2] as string,
          jobId: args[3] as string,
          kind: args[4] as string,
          expiresAt: args[6] as Date,
        };
        return { rows: [], rowCount: 1 };
      }
      if (
        sql.includes("FROM revision_export_links") &&
        link &&
        args[0] === link.id &&
        args[1] === link.projectId
      )
        return {
          rows: [
            {
              revision_id: link.revisionId,
              compile_job_id: link.jobId,
              kind: link.kind,
              expires_at: link.expiresAt,
            },
          ],
        };
      return { rows: [] };
    }),
  };
  const storage = { getLimited: vi.fn(async () => Buffer.from("%PDF-1.7\ncompiled")) };
  const app = Fastify();
  app.decorateRequest("projectAuthorization", undefined);
  app.addHook("preHandler", async (request) => {
    if (role === "DENIED") {
      request.projectAuthorization = undefined as never;
      return;
    }
    request.projectAuthorization = { userId: projectId, role } as never;
  });
  registerRevisionExportRoutes(app, { db: db as never, storage: storage as never });
  const invalid = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/revisions/${revisionId}/exports/links`,
    payload: { kind: "pdf", compileJobId: jobId, public: true },
  });
  expect(invalid.statusCode).toBe(400);
  const created = await app.inject({
    method: "POST",
    url: `/api/v1/projects/${projectId}/revisions/${revisionId}/exports/links`,
    payload: { kind: "pdf", compileJobId: jobId },
  });
  expect(created.statusCode).toBe(201);
  const path = created.json().url as string;
  const read = await app.inject({ method: "GET", url: path });
  expect(read.statusCode).toBe(200);
  role = "DENIED";
  expect((await app.inject({ method: "GET", url: path })).statusCode).toBe(401);
  role = "EDITOR";
  if (link) (link as { expiresAt: Date }).expiresAt = new Date(0);
  expect((await app.inject({ method: "GET", url: path })).statusCode).toBe(410);
  await app.close();
});
