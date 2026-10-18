import { existsSync, readFileSync, readdirSync } from "node:fs";
for (const path of [
  "apps/web/dist/index.html",
  "apps/api/dist/main.js",
  "packages/contracts/dist/index.js",
  "packages/config/dist/index.js",
])
  if (!existsSync(path)) throw new Error(`Missing S00 artifact: ${path}`);
if (!readFileSync("apps/web/dist/index.html", "utf8").includes("/assets/"))
  throw new Error("Web assets not linked");
console.log(
  "S00 browser, API and shared package artifacts verified (G3 import/export worker and migration artifacts checked below).",
);
for (const path of [
  "apps/jobs/dist/main.js",
  "apps/jobs/dist/imports/worker.js",
  "apps/jobs/dist/imports/apply-project.js",
  "packages/db/dist/index.js",
  "packages/storage/dist/source-export.js",
]) {
  if (!existsSync(path)) throw new Error(`Missing G3 worker artifact: ${path}`);
  console.log(`G3 artifact present: ${path}`);
}
const migrations = readdirSync("packages/db/migrations").filter((name) => name.endsWith(".sql"));
const expected = [
  "0001-core.sql",
  "0002-support.sql",
  "0003-session-security.sql",
  "0004-avatar-cleanup.sql",
  "0005-upload-intents.sql",
  "0006-import-jobs.sql",
  "0007-import-upload-intents.sql",
  "0008-compile-jobs.sql",
  "0009-import-project-reservation.sql",
];
for (const name of expected) {
  if (!migrations.includes(name)) throw new Error(`Missing G3 migration artifact: ${name}`);
}
console.log(`G3 migration artifacts verified: ${expected.length} SQL migrations present.`);
