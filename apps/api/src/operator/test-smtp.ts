import { parseServerConfig } from "@latex-collab/config/server";
import { verifySmtpConnection, createSmtpVerificationSender } from "../modules/auth/mail.js";

async function main() {
  const recipient = process.argv[2];
  const config = parseServerConfig(process.env);
  if (!config.SMTP_URL || !config.EMAIL_FROM) {
    throw new Error("SMTP_URL (or SMTP_USER/SMTP_PASS) and EMAIL_FROM are required.");
  }

  const maskedUrl = config.SMTP_URL.replace(/:[^:]*@/, ":****@");
  console.log(`Connecting to SMTP: ${maskedUrl}`);
  console.log(`Email from: ${config.EMAIL_FROM}`);

  await verifySmtpConnection(config.SMTP_URL);
  console.log("SMTP connection and authentication verified successfully.");

  if (recipient) {
    console.log(`Sending test verification email to: ${recipient}`);
    const send = createSmtpVerificationSender(
      config.SMTP_URL,
      config.EMAIL_FROM,
      config.APP_ORIGIN,
    );
    await send(recipient, "test-verification-code-12345");
    console.log("Test email sent successfully.");
  }
}

main().catch((err) => {
  console.error("SMTP verification failed:", (err as Error).message);
  process.exitCode = 1;
});
