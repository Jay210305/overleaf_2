import { it, expect } from "vitest";
import { createServer, safeLoggerOptions } from "../../../apps/api/src/server";
it("keeps private headers, URLs, bodies and internal errors out of captured logs", async () => {
  const messages: string[] = [];
  const app = createServer({
    checkReadiness: async () => true,
    logger: {
      ...safeLoggerOptions(),
      stream: {
        write: (line: string) => {
          messages.push(line);
        },
      },
    },
  });
  app.post("/probe", () => {
    throw new Error("secret-manuscript");
  });
  const response = await app.inject({
    method: "POST",
    url: "/probe?token=secret-url",
    headers: { authorization: "Bearer secret-header", cookie: "session=secret-cookie" },
    payload: { text: "secret-manuscript", password: "secret-password" },
  });
  expect(response.statusCode).toBe(500);
  expect(messages.join("\n")).not.toMatch(/secret-(manuscript|url|header|cookie|password)/);
  expect(messages.join("\n")).toContain(response.json().requestId);
  await app.close();
});
