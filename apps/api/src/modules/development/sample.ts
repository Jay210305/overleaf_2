import type { FastifyInstance } from "fastify";
import { DatabaseClient } from "@latex-collab/db";
import { S3StorageAdapter } from "@latex-collab/storage";
import type { StorageAdapter } from "@latex-collab/contracts";
import { parseServerConfig } from "@latex-collab/config/server";

export interface DevelopmentSampleDependencies {
  db?: DatabaseClient | undefined;
  storage?: StorageAdapter | undefined;
}

export function registerDevelopmentSampleRoute(
  app: FastifyInstance,
  deps?: DevelopmentSampleDependencies | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  app.get("/api/v1/development/sample", async (request, reply) => {
    if (process.env.NODE_ENV === "production") {
      return reply.code(404).send({
        type: "about:blank",
        title: "Not Found",
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        detail: "Development route is disabled in production",
        requestId: request.id,
      });
    }

    let db = deps?.db;
    let ownDb = false;
    if (!db) {
      const config = parseServerConfig(process.env);
      db = new DatabaseClient(config.DATABASE_URL);
      ownDb = true;
    }

    let storage = deps?.storage;
    if (!storage) {
      const config = parseServerConfig(process.env);
      storage = new S3StorageAdapter({
        endpoint: config.S3_ENDPOINT,
        region: config.S3_REGION,
        bucket: config.S3_BUCKET,
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      });
    }

    try {
      const projectResult = await db.query(
        `SELECT id, owner_id, title, compiler, status, current_revision, created_at, updated_at
         FROM projects
         ORDER BY created_at ASC
         LIMIT 1`,
      );

      let project = projectResult.rows[0];

      if (!project) {
        const userIdResult = await db.query(
          `INSERT INTO users (email_normalized, display_name)
           VALUES ('dev-sample@latex-collab.test', 'Dev Sample User')
           ON CONFLICT (email_normalized) DO UPDATE SET display_name = EXCLUDED.display_name
           RETURNING id`,
        );
        const userRow = userIdResult.rows[0];
        if (!userRow) {
          throw new Error("Failed to create development user");
        }
        const userId = userRow.id as string;
        const newProjResult = await db.query(
          `INSERT INTO projects (owner_id, title, compiler, status)
           VALUES ($1, 'Persisted Development Project', 'pdflatex', 'active')
           RETURNING id, owner_id, title, compiler, status, current_revision, created_at, updated_at`,
          [userId],
        );
        project = newProjResult.rows[0];
      }

      if (!project) {
        throw new Error("Failed to initialize development project");
      }

      const sampleKey = `projects/${project.id as string}/sample.tex`;
      let objectRef = await storage.head(sampleKey);

      if (!objectRef) {
        const sampleContent = Buffer.from(
          "\\documentclass{article}\n\\begin{document}\nSample persisted vertical slice\n\\end{document}\n",
        );
        objectRef = await storage.put(sampleKey, sampleContent, "application/x-tex");
      }

      const contentBytes = await storage.get(sampleKey);
      const textContent = Buffer.from(contentBytes).toString("utf8");

      return reply.code(200).send({
        status: "ok",
        environment: process.env.NODE_ENV ?? "development",
        project: {
          id: project.id as string,
          ownerId: project.owner_id as string,
          title: project.title as string,
          compiler: project.compiler as string,
          status: project.status as string,
          currentRevision: Number(project.current_revision ?? 0),
        },
        storage: {
          key: objectRef.key,
          sha256: objectRef.sha256,
          sizeBytes: objectRef.sizeBytes,
          mime: objectRef.mime,
          contentPreview: textContent.slice(0, 50),
        },
      });
    } finally {
      if (ownDb) {
        await db.close();
      }
    }
  });
}
