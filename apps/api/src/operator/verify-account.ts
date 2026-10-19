import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { normalizeEmail } from "../modules/auth/register.js";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: verify-account.ts <email>");
  const config = parseServerConfig(process.env);
  const db = new DatabaseClient(config.DATABASE_URL);
  const normalized = normalizeEmail(email);
  try {
    const result = await db.query<{ id: string; email_normalized: string; email_verified_at: Date | null }>(
      "UPDATE users SET email_verified_at = NOW() WHERE email_normalized = $1 RETURNING id, email_normalized, email_verified_at",
      [normalized],
    );
    if (!result.rows[0]) {
      console.error(`User with email ${normalized} not found.`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nUser ${normalized} has been verified successfully! (email_verified_at: ${result.rows[0].email_verified_at})\n`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error("Verification failed:", (err as Error)?.message || err);
  process.exitCode = 1;
});
