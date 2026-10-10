import { parseServerConfig } from "@latex-collab/config/server";
import { createReadiness } from "./readiness.js";
import { createServer, safeLoggerOptions } from "./server.js";
async function main() {
  const config = parseServerConfig(process.env);
  const probes = createReadiness(config);
  const app = createServer({
    checkReadiness: probes.check,
    origin: config.APP_ORIGIN,
    logger: safeLoggerOptions(config.LOG_LEVEL),
  });
  app.addHook("onClose", () => probes.close());
  const stop = () => {
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await app.listen({ host: "0.0.0.0", port: config.PORT });
}
main().catch(() => {
  console.error("API startup failed: check required configuration and service availability.");
  process.exitCode = 1;
});
