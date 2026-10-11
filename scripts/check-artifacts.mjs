import { existsSync, readFileSync } from "node:fs";
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
  "S00 browser, API and shared package artifacts verified. No TeX or migration artifacts expected before later stages.",
);
