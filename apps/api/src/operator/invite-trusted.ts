import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import { createTrustedRegistrationInvitation, normalizeEmail } from "../modules/auth/register.js";
import { createSmtpInvitationSender } from "../modules/auth/mail.js";

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const displayName = nameParts.join(" ");
  if (!email || !displayName) throw new Error("Usage: invite:trusted <email> <display name>");
  const config = parseServerConfig(process.env);
  if (!config.SMTP_URL || !config.EMAIL_FROM)
    throw new Error("SMTP_URL and EMAIL_FROM are required");
  const db = new DatabaseClient(config.DATABASE_URL);
  try {
    const token = await createTrustedRegistrationInvitation(db, email, displayName);
    await createSmtpInvitationSender(
      config.SMTP_URL,
      config.EMAIL_FROM,
      config.APP_ORIGIN,
    )(normalizeEmail(email), token);
    console.log("Trusted registration invitation sent.");
  } finally {
    await db.close();
  }
}

main().catch(() => {
  console.error(
    "Invitation failed. Check configuration, database, recipient state and mail service.",
  );
  process.exitCode = 1;
});
