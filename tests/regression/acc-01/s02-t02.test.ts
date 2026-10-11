import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionFixture } from "../../helpers/s02-session.js";

describe("ACC-01 S02-T02 login denials", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  beforeAll(async () => {
    fixture = await createSessionFixture();
  });
  afterAll(async () => {
    await fixture.close();
  });

  it("does not issue sessions for unknown, disabled or unverified accounts", async () => {
    const disabled = await fixture.seed(true, true);
    const unverified = await fixture.seed(false);
    expect((await fixture.login("unknown@example.test")).statusCode).toBe(401);
    expect((await fixture.login(disabled.email)).statusCode).toBe(403);
    expect((await fixture.login(unverified.email)).statusCode).toBe(403);
    const count = await fixture.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM sessions WHERE user_id = ANY($1::uuid[])",
      [[disabled.id, unverified.id]],
    );
    expect(count.rows[0]?.count).toBe("0");
  });
});
