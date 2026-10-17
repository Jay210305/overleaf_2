import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  providerCapabilitiesSchema,
  providerErrorSchema,
  resourceSchema,
  syncResultSchema,
} from "@latex-collab/contracts";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import {
  decryptCredential,
  encryptCredential,
} from "../../apps/api/src/modules/integrations/connections.js";

describe("S13-T01: Provider adapter and connection lifecycle", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let projectA: { id: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    userA = await fixture.seed();
    userB = await fixture.seed();

    // Create a project owned by userA
    const projResult = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('Project Integration Test', $1, 'pdflatex', 'active')
       RETURNING id`,
      [userA.id],
    );
    projectA = { id: projResult.rows[0]!.id };

    // Add userB as VIEWER on projectA
    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'VIEWER')`,
      [projectA.id, userB.id],
    );
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession(email: string) {
    const response = await fixture.login(email);
    expect(response.statusCode).toBe(200);
    return {
      cookie: String(response.headers["set-cookie"]).split(";")[0]!,
      csrf: String(response.headers["x-csrf-token"]),
    };
  }

  describe("Typed contracts and capability invariants", () => {
    it("validates provider contract schemas and error models", () => {
      const caps = providerCapabilitiesSchema.parse({
        list: true,
        pull: true,
        push: false,
        individualReferenceImport: true,
      });
      expect(caps.list).toBe(true);

      const err = providerErrorSchema.parse({
        code: "CREDENTIALS_MISSING",
        retryable: false,
        detail: "Missing authorization token",
      });
      expect(err.code).toBe("CREDENTIALS_MISSING");

      const resource = resourceSchema.parse({
        id: "lib-123",
        name: "My Zotero Library",
        kind: "library",
        remoteRevision: "rev-456",
      });
      expect(resource.kind).toBe("library");

      const syncResult = syncResultSchema.parse({
        status: "synced",
        remoteRevision: "rev-789",
        localRevisionId: "loc-001",
        conflicts: [],
      });
      expect(syncResult.status).toBe("synced");
    });

    it("encrypts credentials securely using AES-256-GCM and decrypts accurately", () => {
      const rawToken = "super-secret-zotero-api-key-99999";
      const encrypted = encryptCredential(rawToken);

      expect(encrypted.startsWith("enc:v1:")).toBe(true);
      expect(encrypted).not.toContain(rawToken);

      const decrypted = decryptCredential(encrypted);
      expect(decrypted).toBe(rawToken);
    });
  });

  describe("User connection lifecycle and isolation", () => {
    let connectionIdA: string;

    it("connects a provider with encrypted credentials and returns safe view", async () => {
      const sessionA = await getSession(userA.email);
      const res = await fixture.app.inject({
        method: "POST",
        url: "/api/v1/integrations/connections/zotero/connect",
        headers: {
          origin,
          cookie: sessionA.cookie,
          "x-csrf-token": sessionA.csrf,
        },
        payload: {
          apiKey: "zotero-api-key-abc12345",
          scopes: ["read", "write"],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.connection).toBeDefined();
      expect(body.connection.userId).toBe(userA.id);
      expect(body.connection.provider).toBe("zotero");
      expect(body.connection.status).toBe("active");
      expect(body.capabilities).toEqual({
        list: true,
        pull: true,
        push: false,
        individualReferenceImport: true,
      });

      // Crucial security invariant: raw token and encryptedCredentialRef must NOT be in the response
      expect(JSON.stringify(body)).not.toContain("zotero-api-key-abc12345");
      expect(body.connection.encryptedCredentialRef).toBeUndefined();

      connectionIdA = body.connection.id;
    });

    it("verifies user connection isolation: userB cannot see userA's connections", async () => {
      const sessionB = await getSession(userB.email);
      const res = await fixture.app.inject({
        method: "GET",
        url: "/api/v1/integrations/connections",
        headers: {
          origin,
          cookie: sessionB.cookie,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(0);
    });

    it("supports token rotation via refresh endpoint", async () => {
      const sessionA = await getSession(userA.email);
      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/integrations/connections/${connectionIdA}/refresh`,
        headers: {
          origin,
          cookie: sessionA.cookie,
          "x-csrf-token": sessionA.csrf,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.connection.id).toBe(connectionIdA);
      expect(body.refreshedAt).toBeDefined();
    });

    it("rejects unauthorized provider access (e.g. Mendeley/Papers without legitimate API)", async () => {
      const sessionA = await getSession(userA.email);
      const res = await fixture.app.inject({
        method: "POST",
        url: "/api/v1/integrations/connections/mendeley/connect",
        headers: {
          origin,
          cookie: sessionA.cookie,
          "x-csrf-token": sessionA.csrf,
        },
        payload: {
          apiKey: "mendeley-test-token",
        },
      });

      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.code).toBe("CAPABILITY_UNSUPPORTED");
      expect(body.detail).toContain("BLOCKED_BY_PROVIDER");
    });
  });

  describe("Project integration linking and permission separation", () => {
    let connectionIdA: string;
    let connectionIdB: string;
    let integrationId: string;

    beforeAll(async () => {
      // Connect zotero for userA
      const sessionA = await getSession(userA.email);
      const resA = await fixture.app.inject({
        method: "POST",
        url: "/api/v1/integrations/connections/zotero/connect",
        headers: { origin, cookie: sessionA.cookie, "x-csrf-token": sessionA.csrf },
        payload: { apiKey: "token-user-a" },
      });
      connectionIdA = resA.json().connection.id;

      // Connect dropbox for userB
      const sessionB = await getSession(userB.email);
      const resB = await fixture.app.inject({
        method: "POST",
        url: "/api/v1/integrations/connections/dropbox/connect",
        headers: { origin, cookie: sessionB.cookie, "x-csrf-token": sessionB.csrf },
        payload: { apiKey: "token-user-b" },
      });
      connectionIdB = resB.json().connection.id;
    });

    it("allows OWNER to link their own connection to the project", async () => {
      const sessionA = await getSession(userA.email);
      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectA.id}/integrations`,
        headers: {
          origin,
          cookie: sessionA.cookie,
          "x-csrf-token": sessionA.csrf,
        },
        payload: {
          connectionId: connectionIdA,
          remoteRef: "zotero://groups/12345/collection/67890",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.projectId).toBe(projectA.id);
      expect(body.connectionId).toBe(connectionIdA);
      expect(body.provider).toBe("zotero");
      expect(body.remoteRef).toBe("zotero://groups/12345/collection/67890");
      integrationId = body.id;
    });

    it("prevents userA from linking userB's connection to the project", async () => {
      const sessionA = await getSession(userA.email);
      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectA.id}/integrations`,
        headers: {
          origin,
          cookie: sessionA.cookie,
          "x-csrf-token": sessionA.csrf,
        },
        payload: {
          connectionId: connectionIdB, // belongs to userB!
          remoteRef: "dropbox://my-folder",
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.code).toBe("PROJECT_PERMISSION_DENIED");
    });

    it("prevents VIEWER (userB) from linking an integration to projectA", async () => {
      const sessionB = await getSession(userB.email);
      const res = await fixture.app.inject({
        method: "POST",
        url: `/api/v1/projects/${projectA.id}/integrations`,
        headers: {
          origin,
          cookie: sessionB.cookie,
          "x-csrf-token": sessionB.csrf,
        },
        payload: {
          connectionId: connectionIdB,
          remoteRef: "dropbox://my-folder",
        },
      });

      // project guard denies EDIT action for VIEWER
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.code).toBe("PROJECT_PERMISSION_DENIED");
    });

    it("allows authorized members to list project integrations", async () => {
      const sessionA = await getSession(userA.email);
      const res = await fixture.app.inject({
        method: "GET",
        url: `/api/v1/projects/${projectA.id}/integrations`,
        headers: {
          origin,
          cookie: sessionA.cookie,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
      expect(body.items[0].remoteRef).toBe("zotero://groups/12345/collection/67890");
    });

    it("allows unlinking a project integration", async () => {
      const sessionA = await getSession(userA.email);
      const res = await fixture.app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectA.id}/integrations/${integrationId}`,
        headers: {
          origin,
          cookie: sessionA.cookie,
          "x-csrf-token": sessionA.csrf,
        },
      });

      expect(res.statusCode).toBe(204);
    });
  });
});
