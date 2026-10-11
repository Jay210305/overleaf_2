import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
const password = randomBytes(24).toString("hex");
const access = randomBytes(12).toString("hex");
const secret = randomBytes(24).toString("hex");
const values = {
  POSTGRES_PASSWORD: password,
  DATABASE_URL: `postgresql://latex:${password}@127.0.0.1:55432/latex`,
  S3_ACCESS_KEY_ID: access,
  S3_SECRET_ACCESS_KEY: secret,
};
const lines = readFileSync(".env.example", "utf8")
  .split("\n")
  .map((line) => {
    const key = line.split("=")[0];
    return Object.hasOwn(values, key) ? `${key}=${values[key]}` : line;
  });
try {
  writeFileSync(".env", lines.join("\n"), { flag: "wx", mode: 0o600 });
  console.log("Local .env created with random credentials. Keep it private.");
} catch (error) {
  if (error.code === "EEXIST") console.log("Existing .env preserved.");
  else throw error;
}
