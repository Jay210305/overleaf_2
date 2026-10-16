import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture, origin } from "../../helpers/s02-session.js";
import {
  CHAT_CREATE_LIMIT,
  CHAT_CREATE_WINDOW_SECONDS,
} from "../../../apps/api/src/modules/chat/safety.js";
import {
  COMMENT_CREATE_LIMIT,
  COMMENT_CREATE_WINDOW_SECONDS,
} from "../../../apps/api/src/modules/comments/safety.js";

describe("S08-T07 comment and chat rate limits (COL-07)", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let projectId: string;
  let otherProjectId: string;
  let owner: { id: string; email: string };
  let member: { id: string; email: string };

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
    member = await fixture.seed();
    projectId = randomUUID();
    otherProjectId = randomUUID();
    for (const id of [projectId, otherProjectId]) {
      await fixture.db.query(
        "INSERT INTO projects (id, owner_id, title) VALUES ($1, $2, 'Rate limits')",
        [id, owner.id],
      );
    }
    await fixture.db.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'EDITOR'), ($3, $2, 'EDITOR')",
      [projectId, member.id, otherProjectId],
    );
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  async function headers(email: string) {
    const login = await fixture.login(email);
    expect(login.statusCode).toBe(200);
    return {
      origin,
      cookie: String(login.headers["set-cookie"]).split(";")[0]!,
      "x-csrf-token": String(login.headers["x-csrf-token"]),
    };
  }

  function seedChatMessages(count: number, authorId: string, targetProjectId: string) {
    return fixture.db.query(
      `INSERT INTO chat_messages (project_id, author_id, body)
       SELECT $1, $2, 'seed ' || g FROM generate_series(1, $3) g`,
      [targetProjectId, authorId, count],
    );
  }

  it("documents the configured limits", () => {
    expect(CHAT_CREATE_LIMIT).toBe(30);
    expect(CHAT_CREATE_WINDOW_SECONDS).toBe(60);
    expect(COMMENT_CREATE_LIMIT).toBe(30);
    expect(COMMENT_CREATE_WINDOW_SECONDS).toBe(300);
  });

  it("rejects chat flooding with 429 while other authors and projects stay usable", async () => {
    const memberHeaders = await headers(member.email);
    await seedChatMessages(CHAT_CREATE_LIMIT, member.id, projectId);
    const limited = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/chat/messages`,
      headers: memberHeaders,
      payload: { body: "one too many" },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().code).toBe("RATE_LIMITED");
    const stored = await fixture.db.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM chat_messages WHERE project_id = $1 AND author_id = $2",
      [projectId, member.id],
    );
    expect(stored.rows[0]!.count).toBe(String(CHAT_CREATE_LIMIT));
    const ownerHeaders = await headers(owner.email);
    const otherAuthor = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/chat/messages`,
      headers: ownerHeaders,
      payload: { body: "owner unaffected" },
    });
    expect(otherAuthor.statusCode).toBe(201);
    const otherProject = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${otherProjectId}/chat/messages`,
      headers: memberHeaders,
      payload: { body: "other project unaffected" },
    });
    expect(otherProject.statusCode).toBe(201);
  });

  it("ignores chat history outside the sliding window", async () => {
    const memberHeaders = await headers(member.email);
    await fixture.db.query("DELETE FROM chat_messages WHERE project_id = $1 AND author_id = $2", [
      projectId,
      member.id,
    ]);
    await fixture.db.query(
      `INSERT INTO chat_messages (project_id, author_id, body, created_at)
       SELECT $1, $2, 'old ' || g, NOW() - ($3 || ' seconds')::interval
       FROM generate_series(1, $4) g`,
      [projectId, member.id, CHAT_CREATE_WINDOW_SECONDS + 60, CHAT_CREATE_LIMIT],
    );
    const response = await fixture.app.inject({
      method: "POST",
      url: `/api/v1/projects/${projectId}/chat/messages`,
      headers: memberHeaders,
      payload: { body: "window moved on" },
    });
    expect(response.statusCode).toBe(201);
  });
});
