import { expect, it } from "vitest";
import { createServer } from "../../../apps/api/src/server.js";
import { safeLoggerOptions } from "../../../apps/api/src/plugins/logging.js";

it("omits auth secrets, source content and error messages from captured logs", async () => {
  const lines: string[] = [];
  const app = createServer({
    checkReadiness: async () => true,
    logger: {
      ...safeLoggerOptions(),
      stream: { write: (line: string) => lines.push(line) },
    },
  });
  app.post("/log-probe", (request) => {
    const hiddenError = new Error("secret-error-message");
    hiddenError.name = "secret-error-name";
    request.log.error(
      {
        err: hiddenError,
        body: request.body,
        query: request.query,
        headers: request.headers,
      },
      "Probe failed",
    );
    throw new Error("secret-internal-error");
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/log-probe?token=secret-query-token",
      headers: {
        authorization: "Bearer secret-authorization",
        cookie: "session=secret-cookie",
        "x-csrf-token": "secret-csrf-token",
        "x-registration-invite": "secret-invitation",
      },
      payload: {
        password: "secret-password",
        token: "secret-body-token",
        source: "secret-private-source",
      },
    });
    expect(response.statusCode).toBe(500);
    const log = lines.join("\n");
    expect(log).not.toContain("secret-");
    expect(log).toContain(response.json().requestId);
  } finally {
    await app.close();
  }
});
