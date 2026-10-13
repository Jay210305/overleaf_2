import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import { createProject } from "../../../apps/api/src/modules/projects/create.js";
import {
  TextSaveCoordinator,
  type SaveTransport,
} from "../../../apps/web/src/features/editor/persistence.js";
import type { ApplyTextUpdateInput, DurableAck } from "@latex-collab/contracts";

describe("NFR-01 S04-T03 Zero acknowledged edits lost across controlled server restart", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("restarts server after multiple acknowledged edits and retrieves exact content", async () => {
    const loginRes = await fixture.login(owner.email);
    const cookie = String(loginRes.headers["set-cookie"]).split(";")[0]!;
    const csrf = String(loginRes.headers["x-csrf-token"]);

    const proj = await createProject(fixture.db, owner.id, {
      title: `NFR01-Restart-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });
    const projectId = proj.id;
    const fileId = proj.mainFileId!;

    const transport: SaveTransport = {
      async save(pId: string, fId: string, input: ApplyTextUpdateInput) {
        const res = await fixture.app.inject({
          method: "PUT",
          url: `/api/v1/projects/${pId}/files/${fId}/text`,
          headers: {
            origin,
            cookie,
            "x-csrf-token": csrf,
            "content-type": "application/json",
          },
          payload: input,
        });
        if (res.statusCode !== 200) {
          throw res.json();
        }
        return res.json() as { ack: DurableAck };
      },
    };

    const coordinator = new TextSaveCoordinator({
      projectId,
      fileId,
      transport,
    });

    // 1. Fetch initial state
    const initRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie },
    });
    const serverState = initRes.json();

    const localDoc = new Y.Doc();
    Y.applyUpdate(localDoc, Buffer.from(serverState.updateBase64, "base64"));
    const localText = localDoc.getText("content");

    // Edit 1: Insert Title
    localText.insert(0, "% Critical Research Document\n");
    const update1 = Buffer.from(Y.encodeStateAsUpdate(localDoc)).toString("base64");
    const ack1 = await coordinator.enqueue(update1, serverState.stateVectorBase64);
    expect(ack1.persistedSeq).toBe(1);

    // Edit 2: Insert Body
    localText.insert(localText.length, "\\section{Introduction}\nImportant durable findings.\n");
    const update2 = Buffer.from(Y.encodeStateAsUpdate(localDoc)).toString("base64");
    const ack2 = await coordinator.enqueue(update2, ack1.stateVectorBase64);
    expect(ack2.persistedSeq).toBe(2);
    expect(coordinator.getStatus()).toBe("saved");
    coordinator.destroy();

    const expectedContent = localText.toString();

    // 2. Simulate controlled server restart:
    // Close the Fastify app instance and instantiate a brand-new Fastify server connected to same DB
    await fixture.app.close();

    // Re-create the session fixture app pointing to the exact same database
    const restartedFixture = await createSessionFixture();
    const relogin = await restartedFixture.login(owner.email);
    const newCookie = String(relogin.headers["set-cookie"]).split(";")[0]!;

    // 3. Re-read canonical text from the restarted server
    const restoredRes = await restartedFixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: newCookie },
    });

    expect(restoredRes.statusCode).toBe(200);
    const restoredState = restoredRes.json();
    expect(restoredState.persistedSeq).toBe(2);

    const restoredDoc = new Y.Doc();
    Y.applyUpdate(restoredDoc, Buffer.from(restoredState.updateBase64, "base64"));
    expect(restoredDoc.getText("content").toString()).toBe(expectedContent);

    await restartedFixture.close();
  });
});
