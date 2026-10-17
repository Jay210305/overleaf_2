import net from "node:net";

/**
 * Clears the API's Redis-backed auth rate-limit window.
 *
 * The browser suite performs many logins from the single test-runner IP, which
 * can exceed the per-IP limits that protect real deployments. Specs assert the
 * limiter through the S02-T06 integration suite and the intercepted 429 in
 * auth-forms.spec.ts, so the end-to-end journey clears the counters instead of
 * changing the production limits.
 */
function encodeCommand(args: string[]): Buffer {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) parts.push(`$${Buffer.byteLength(arg, "utf8")}\r\n${arg}\r\n`);
  return Buffer.from(parts.join(""), "utf8");
}

const clearScript = [
  "local keys = redis.call('KEYS', ARGV[1])",
  "if next(keys) == nil then return 0 end",
  "return redis.call('DEL', unpack(keys))",
].join(" ");

export async function flushAuthRateLimits(
  redisUrl: string,
  namespace = "auth:v1",
): Promise<number> {
  const url = new URL(redisUrl);
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 6379;
  const commands: string[][] = [];
  if (url.password) commands.push(["AUTH", url.password]);
  commands.push(["EVAL", clearScript, "0", `${namespace}:*`]);
  const payload = Buffer.concat(commands.map((command) => encodeCommand(command)));

  return await new Promise<number>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let received = "";
    let integerReplies = 0;
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("redis timeout"));
    }, 2000);
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      socket.destroy();
      fn();
    };
    socket.on("connect", () => socket.write(payload));
    socket.on("data", (chunk) => {
      received += chunk.toString("utf8");
      const lines = received.split("\r\n");
      while (integerReplies < commands.length && lines.length > 1) {
        const line = lines.shift()!;
        if (line.startsWith("-")) {
          settle(() => reject(new Error(line.slice(1))));
          return;
        }
        if (line.startsWith(":") || line.startsWith("+")) {
          const value = Number(line.slice(1));
          integerReplies += 1;
          if (integerReplies === commands.length)
            settle(() => resolve(Number.isFinite(value) ? value : 0));
        }
      }
      received = lines.join("\r\n");
    });
    socket.on("error", (error) => settle(() => reject(error)));
  });
}
