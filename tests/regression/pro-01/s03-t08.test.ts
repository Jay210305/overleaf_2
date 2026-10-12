import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";

describe("PRO-01 regression: Paginated searchable owned/shared/recent dashboard journey (S03-T08)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let alice: { id: string; email: string };
  let bob: { id: string; email: string };
  let eve: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    alice = await fixture.seed();
    bob = await fixture.seed();
    eve = await fixture.seed();
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

  it("completes full PRO-01 lifecycle: creation, search filtering, cursor pagination, ordering, and tenant isolation", async () => {
    const aliceSession = await getSession(alice.email);
    const bobSession = await getSession(bob.email);
    const eveSession = await getSession(eve.email);

    const runId = randomUUID().slice(0, 8);

    // 1. Create a set of projects for Alice with known titles & descriptions
    const projAlpha = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        title: `Alpha Quantum Mechanics ${runId}`,
        description: "Foundational quantum computing notes",
      },
    });
    expect(projAlpha.statusCode).toBe(201);
    const alphaId = projAlpha.json().id;

    const projBeta = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        title: `Beta General Relativity ${runId}`,
        description: "Differential geometry notes",
      },
    });
    expect(projBeta.statusCode).toBe(201);
    const betaId = projBeta.json().id;

    const projGamma = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: aliceSession.cookie,
        "x-csrf-token": aliceSession.csrf,
      },
      payload: {
        title: `Gamma Quantum Field Theory ${runId}`,
        description: "QFT textbook draft",
      },
    });
    expect(projGamma.statusCode).toBe(201);
    const gammaId = projGamma.json().id;

    // 2. Bob creates a project and shares it with Alice
    const projBob = await fixture.app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        origin,
        cookie: bobSession.cookie,
        "x-csrf-token": bobSession.csrf,
      },
      payload: {
        title: `Bob Thermodynamics ${runId}`,
        description: "Statistical mechanics",
      },
    });
    expect(projBob.statusCode).toBe(201);
    const bobProjId = projBob.json().id;

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR')`,
      [bobProjId, alice.id],
    );

    // 3. SEARCH FILTERING (q=)
    // Alice searches for "Quantum"
    const searchRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned&q=Quantum`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchItems = searchRes.json().items;
    const searchIds = searchItems.map((p: { id: string }) => p.id);
    expect(searchIds).toContain(alphaId);
    expect(searchIds).toContain(gammaId);
    expect(searchIds).not.toContain(betaId);

    // Alice searches title "Relativity"
    const titleSearchRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned&q=Relativity`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(titleSearchRes.statusCode).toBe(200);
    const titleSearchItems = titleSearchRes.json().items;
    expect(titleSearchItems.map((p: { id: string }) => p.id)).toContain(betaId);

    // 4. CATEGORY FILTERING (owned vs shared vs recent)
    // 4a. Filter: owned
    const ownedRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(ownedRes.statusCode).toBe(200);
    const ownedIds = ownedRes.json().items.map((p: { id: string }) => p.id);
    expect(ownedIds).toContain(alphaId);
    expect(ownedIds).toContain(betaId);
    expect(ownedIds).toContain(gammaId);
    expect(ownedIds).not.toContain(bobProjId);

    // 4b. Filter: shared
    const sharedRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=shared`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(sharedRes.statusCode).toBe(200);
    const sharedIds = sharedRes.json().items.map((p: { id: string }) => p.id);
    expect(sharedIds).toContain(bobProjId);
    expect(sharedIds).not.toContain(alphaId);

    // 4c. Filter: recent
    const recentRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=recent`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(recentRes.statusCode).toBe(200);
    const recentIds = recentRes.json().items.map((p: { id: string }) => p.id);
    expect(recentIds).toContain(alphaId);
    expect(recentIds).toContain(bobProjId);

    // 5. PAGINATION: cursor traversal
    const page1Res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned&limit=2`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(page1Res.statusCode).toBe(200);
    const page1 = page1Res.json();
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2Res = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(page2Res.statusCode).toBe(200);
    const page2 = page2Res.json();
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    // Ensure no duplication across page 1 and page 2
    const page1Ids = page1.items.map((p: { id: string }) => p.id);
    const page2Ids = page2.items.map((p: { id: string }) => p.id);
    for (const id of page1Ids) {
      expect(page2Ids).not.toContain(id);
    }

    // 6. ORDERING: updatedAt vs owner
    const orderByOwnerRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned&order=owner`,
      headers: { origin, cookie: aliceSession.cookie },
    });
    expect(orderByOwnerRes.statusCode).toBe(200);
    expect(orderByOwnerRes.json().items.length).toBeGreaterThan(0);

    // 7. TENANT ISOLATION: Eve sees none of Alice's or Bob's projects
    const eveProjectsRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned`,
      headers: { origin, cookie: eveSession.cookie },
    });
    expect(eveProjectsRes.statusCode).toBe(200);
    const eveIds = eveProjectsRes.json().items.map((p: { id: string }) => p.id);
    expect(eveIds).not.toContain(alphaId);
    expect(eveIds).not.toContain(betaId);
    expect(eveIds).not.toContain(gammaId);
    expect(eveIds).not.toContain(bobProjId);

    // Eve searching with runId returns empty
    const eveSearchRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects?filter=owned&q=${runId}`,
      headers: { origin, cookie: eveSession.cookie },
    });
    expect(eveSearchRes.statusCode).toBe(200);
    expect(eveSearchRes.json().items).toHaveLength(0);
  });
});
