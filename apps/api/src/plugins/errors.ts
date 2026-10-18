import type { FastifyInstance } from "fastify";
export function problem(status: number, code: string, requestId: string, customDetail?: string) {
  return {
    type: `https://latex-workspace.example/errors/${code.toLowerCase()}`,
    title: status >= 500 ? "Service unavailable" : "Request rejected",
    status,
    code,
    detail:
      customDetail ??
      (status >= 500
        ? "The service is temporarily unavailable."
        : "The request could not be processed."),
    requestId,
  };
}
export function registerErrors(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .type("application/problem+json")
      .send(problem(404, "RESOURCE_NOT_FOUND", request.id)),
  );
  app.setErrorHandler((error, request, reply) => {
    const fault = error as { statusCode?: unknown };
    const status =
      typeof fault.statusCode === "number" && fault.statusCode >= 400 && fault.statusCode < 500
        ? fault.statusCode
        : 500;
    request.log.error({ requestId: request.id, status }, "Request failed");
    reply
      .code(status)
      .type("application/problem+json")
      .send(problem(status, status === 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR", request.id));
  });
}
