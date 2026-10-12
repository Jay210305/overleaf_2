export function safeLoggerOptions(level = "info") {
  return {
    level,
    serializers: {
      req: (request: { method: string }) => ({ method: request.method }),
      res: (reply: { statusCode: number }) => ({ statusCode: reply.statusCode }),
      err: () => ({
        type: "Error",
        message: "[redacted]",
        stack: "[redacted]",
      }),
    },
    redact: [
      "body",
      "payload",
      "query",
      "headers",
      "req.body",
      "req.query",
      "req.headers",
      "password",
      "token",
      "source",
      "content",
      "authorization",
      "cookie",
      "csrf",
    ],
  };
}
