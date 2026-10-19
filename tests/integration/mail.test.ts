import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { parseServerConfig } from "@latex-collab/config/server";
import {
  createSmtpVerificationSender,
  createSmtpPasswordResetSender,
  createSmtpInvitationSender,
  createSmtpProjectInvitationSender,
  verifySmtpConnection,
} from "../../apps/api/src/modules/auth/mail.js";

try {
  loadEnvFile(".env");
} catch {}

const config = parseServerConfig(process.env);
const appOrigin = config.APP_ORIGIN;

describe("SMTP Mail Sender formatting and delivery", () => {
  it("verifies SMTP connection to local Mailpit service", async () => {
    const verified = await verifySmtpConnection(config.SMTP_URL ?? "smtp://127.0.0.1:51025");
    expect(verified).toBe(true);
  });

  it("delivers verification email with both link and raw code in text and html", async () => {
    const recipient = `verify-${randomUUID()}@example.test`;
    const token = "test-verify-token-abcdef123456";
    const sender = createSmtpVerificationSender(
      config.SMTP_URL ?? "smtp://127.0.0.1:51025",
      config.EMAIL_FROM ?? "support@example.test",
      appOrigin,
    );

    await sender(recipient, token);

    const inbox = (await (await fetch(`${config.MAILPIT_URL}/api/v1/messages`)).json()) as {
      messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
    };
    const message = inbox.messages.find((m) => m.To.some((to) => to.Address === recipient));
    expect(message).toBeDefined();
    expect(message?.Subject).toBe("Verify your LaTeX Workspace email");

    const detail = (await (
      await fetch(`${config.MAILPIT_URL}/api/v1/message/${message!.ID}`)
    ).json()) as {
      Text: string;
      HTML: string;
    };

    expect(detail.Text).toContain(token);
    expect(detail.Text).toContain(`${appOrigin}/verify-email#token=${token}`);
    expect(detail.HTML).toContain(token);
    expect(detail.HTML).toContain(`${appOrigin}/verify-email#token=${token}`);
  });

  it("delivers password reset email with both link and raw code in text and html", async () => {
    const recipient = `reset-${randomUUID()}@example.test`;
    const token = "test-reset-token-abcdef123456";
    const sender = createSmtpPasswordResetSender(
      config.SMTP_URL ?? "smtp://127.0.0.1:51025",
      config.EMAIL_FROM ?? "support@example.test",
      appOrigin,
    );

    await sender(recipient, token);

    const inbox = (await (await fetch(`${config.MAILPIT_URL}/api/v1/messages`)).json()) as {
      messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
    };
    const message = inbox.messages.find((m) => m.To.some((to) => to.Address === recipient));
    expect(message).toBeDefined();
    expect(message?.Subject).toBe("Reset your LaTeX Workspace password");

    const detail = (await (
      await fetch(`${config.MAILPIT_URL}/api/v1/message/${message!.ID}`)
    ).json()) as {
      Text: string;
      HTML: string;
    };

    expect(detail.Text).toContain(token);
    expect(detail.Text).toContain(`${appOrigin}/reset-password#token=${token}`);
    expect(detail.HTML).toContain(token);
  });

  it("delivers registration invitation with both link and raw code in text and html", async () => {
    const recipient = `invite-${randomUUID()}@example.test`;
    const token = "test-invite-token-abcdef123456";
    const sender = createSmtpInvitationSender(
      config.SMTP_URL ?? "smtp://127.0.0.1:51025",
      config.EMAIL_FROM ?? "support@example.test",
      appOrigin,
    );

    await sender(recipient, token);

    const inbox = (await (await fetch(`${config.MAILPIT_URL}/api/v1/messages`)).json()) as {
      messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
    };
    const message = inbox.messages.find((m) => m.To.some((to) => to.Address === recipient));
    expect(message).toBeDefined();
    expect(message?.Subject).toBe("Your trusted LaTeX Workspace invitation");

    const detail = (await (
      await fetch(`${config.MAILPIT_URL}/api/v1/message/${message!.ID}`)
    ).json()) as {
      Text: string;
      HTML: string;
    };

    expect(detail.Text).toContain(token);
    expect(detail.Text).toContain(`${appOrigin}/register#invitation=${token}`);
    expect(detail.HTML).toContain(token);
  });

  it("delivers project invitation with both link and raw code in text and html", async () => {
    const recipient = `project-${randomUUID()}@example.test`;
    const token = "test-proj-token-abcdef123456";
    const sender = createSmtpProjectInvitationSender(
      config.SMTP_URL ?? "smtp://127.0.0.1:51025",
      config.EMAIL_FROM ?? "support@example.test",
      appOrigin,
    );

    await sender(recipient, token);

    const inbox = (await (await fetch(`${config.MAILPIT_URL}/api/v1/messages`)).json()) as {
      messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
    };
    const message = inbox.messages.find((m) => m.To.some((to) => to.Address === recipient));
    expect(message).toBeDefined();
    expect(message?.Subject).toBe("Join a LaTeX Workspace project");

    const detail = (await (
      await fetch(`${config.MAILPIT_URL}/api/v1/message/${message!.ID}`)
    ).json()) as {
      Text: string;
      HTML: string;
    };

    expect(detail.Text).toContain(token);
    expect(detail.Text).toContain(`${appOrigin}/invitations#token=${token}`);
    expect(detail.HTML).toContain(token);
  });
});
