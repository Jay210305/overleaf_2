import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
if (existsSync(".env")) loadEnvFile(".env");
const privateValues = ["POSTGRES_PASSWORD", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]
  .map((key) => process.env[key])
  .filter(Boolean);
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((e) => {
    const path = join(root, e.name);
    return [
      "node_modules",
      ".git",
      "graphify-out",
      "coverage",
      "playwright-report",
      "test-results",
    ].includes(e.name)
      ? []
      : e.isDirectory()
        ? files(path)
        : [path];
  });
}
for (const file of files(".")) {
  if (file === ".env" || file.endsWith("pnpm-lock.yaml") || /\.(png|jpg|woff2?)$/.test(file))
    continue;
  const text = readFileSync(file, "utf8");
  if (
    privateValues.some((value) => text.includes(value)) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
  )
    throw new Error(`Private value detected in ${file}`);
}
console.log("Secret scan passed; local credentials absent from source and builds.");
