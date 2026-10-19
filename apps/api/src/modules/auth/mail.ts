import nodemailer from "nodemailer";
import type { SendVerification } from "./register.js";
import type { SendPasswordReset } from "./password-reset.js";
import type { SendProjectInvitation } from "../sharing/invitations.js";

export async function verifySmtpConnection(smtpUrl: string): Promise<boolean> {
  const transport = nodemailer.createTransport(smtpUrl);
  await transport.verify();
  return true;
}

function getTransport(smtpUrl: string) {
  try {
    const parsed = new URL(smtpUrl);
    const isSecure = parsed.protocol === "smtps:";
    const host = parsed.hostname;
    const port = parsed.port ? Number(parsed.port) : isSecure ? 465 : 587;
    const auth =
      parsed.username || parsed.password
        ? {
            user: decodeURIComponent(parsed.username),
            pass: decodeURIComponent(parsed.password),
          }
        : undefined;
    return nodemailer.createTransport({
      host,
      port,
      secure: isSecure,
      auth,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });
  } catch {
    return nodemailer.createTransport(smtpUrl);
  }
}

export function createEmailSenders(config: {
  APP_ORIGIN: string;
  EMAIL_FROM?: string | undefined;
  SMTP_URL?: string | undefined;
  RESEND_API_KEY?: string | undefined;
}) {
  const { APP_ORIGIN, EMAIL_FROM, SMTP_URL, RESEND_API_KEY } = config;
  if (!EMAIL_FROM || (!RESEND_API_KEY && !SMTP_URL)) return undefined;
  const transport: MailTransport = RESEND_API_KEY
    ? {
        async sendMail(message) {
          let response: Response;
          try {
            response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              redirect: "error",
              headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ ...message, to: [message.to] }),
              signal: AbortSignal.timeout(10000),
            });
          } catch {
            throw new Error("Email delivery unavailable");
          }
          await response.body?.cancel();
          if (!response.ok) throw new Error(`Email delivery failed (HTTP ${response.status})`);
        },
      }
    : getTransport(SMTP_URL!);
  return {
    sendVerification: createSmtpVerificationSender(transport, EMAIL_FROM, APP_ORIGIN),
    sendInvitation: createSmtpInvitationSender(transport, EMAIL_FROM, APP_ORIGIN),
    sendPasswordReset: createSmtpPasswordResetSender(transport, EMAIL_FROM, APP_ORIGIN),
    sendProjectInvitation: createSmtpProjectInvitationSender(transport, EMAIL_FROM, APP_ORIGIN),
  };
}

type MailTransport = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
};
const mailTransport = (value: string | MailTransport) =>
  typeof value === "string" ? getTransport(value) : value;

export function createSmtpVerificationSender(
  smtpUrl: string | MailTransport,
  from: string,
  appOrigin: string,
): SendVerification {
  const transport = mailTransport(smtpUrl);
  return async (email, token) => {
    const link = new URL("/verify-email", appOrigin);
    link.hash = new URLSearchParams({ token }).toString();
    await transport.sendMail({
      from,
      to: email,
      subject: "Verify your LaTeX Workspace email",
      text: `Open this link to verify your email address within 24 hours:\n${link.toString()}\n\nOr enter this verification code directly:\n${token}\n`,
      html: `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; background: #ffffff;"><h2 style="margin-top: 0; color: #111827;">Verify your LaTeX Workspace email</h2><p>Please confirm your email address to complete your account setup. This link is valid for 24 hours.</p><div style="margin: 24px 0;"><a href="${link.toString()}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Verify Email</a></div><p style="margin-bottom: 8px; color: #4b5563;">Or copy and paste this verification code into the application:</p><div style="background: #f3f4f6; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 14px; word-break: break-all; color: #1f2937;">${token}</div><hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" /><p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">If you did not request this, you can safely ignore this email.</p></div></body></html>`,
    });
  };
}

export function createSmtpInvitationSender(
  smtpUrl: string | MailTransport,
  from: string,
  appOrigin: string,
): SendVerification {
  const transport = mailTransport(smtpUrl);
  return async (email, token) => {
    const link = new URL("/register", appOrigin);
    link.hash = new URLSearchParams({ invitation: token }).toString();
    await transport.sendMail({
      from,
      to: email,
      subject: "Your trusted LaTeX Workspace invitation",
      text: `Open this link to create your trusted account within 24 hours:\n${link.toString()}\n\nOr enter this invitation code directly:\n${token}\n`,
      html: `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; background: #ffffff;"><h2 style="margin-top: 0; color: #111827;">Your trusted LaTeX Workspace invitation</h2><p>You have been invited to create a trusted account on LaTeX Workspace. This invitation is valid for 24 hours.</p><div style="margin: 24px 0;"><a href="${link.toString()}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Accept Invitation</a></div><p style="margin-bottom: 8px; color: #4b5563;">Or copy and paste this invitation code into the registration form:</p><div style="background: #f3f4f6; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 14px; word-break: break-all; color: #1f2937;">${token}</div><hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" /><p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">If you did not expect this invitation, you can safely ignore this email.</p></div></body></html>`,
    });
  };
}

export function createSmtpPasswordResetSender(
  smtpUrl: string | MailTransport,
  from: string,
  appOrigin: string,
): SendPasswordReset {
  const transport = mailTransport(smtpUrl);
  return async (email, token) => {
    const link = new URL("/reset-password", appOrigin);
    link.hash = new URLSearchParams({ token }).toString();
    await transport.sendMail({
      from,
      to: email,
      subject: "Reset your LaTeX Workspace password",
      text: `Open this link to reset your password within one hour:\n${link.toString()}\n\nOr enter this reset code directly:\n${token}\n`,
      html: `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; background: #ffffff;"><h2 style="margin-top: 0; color: #111827;">Reset your LaTeX Workspace password</h2><p>We received a request to reset your password. This link is valid for 1 hour.</p><div style="margin: 24px 0;"><a href="${link.toString()}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Reset Password</a></div><p style="margin-bottom: 8px; color: #4b5563;">Or copy and paste this reset code into the application:</p><div style="background: #f3f4f6; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 14px; word-break: break-all; color: #1f2937;">${token}</div><hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" /><p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">If you did not request a password reset, you can safely ignore this email.</p></div></body></html>`,
    });
  };
}

export function createSmtpProjectInvitationSender(
  smtpUrl: string | MailTransport,
  from: string,
  appOrigin: string,
): SendProjectInvitation {
  const transport = mailTransport(smtpUrl);
  return async (email, token) => {
    const link = new URL("/invitations", appOrigin);
    link.hash = new URLSearchParams({ token }).toString();
    await transport.sendMail({
      from,
      to: email,
      subject: "Join a LaTeX Workspace project",
      text: `Sign in with this email address and open the project invitation within seven days:\n${link.toString()}\n\nOr enter this invitation code directly:\n${token}\n`,
      html: `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; line-height: 1.5; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; background: #ffffff;"><h2 style="margin-top: 0; color: #111827;">Join a LaTeX Workspace project</h2><p>You have been invited to collaborate on a LaTeX Workspace project. This invitation is valid for 7 days.</p><div style="margin: 24px 0;"><a href="${link.toString()}" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">Open Invitation</a></div><p style="margin-bottom: 8px; color: #4b5563;">Or copy and paste this invitation token:</p><div style="background: #f3f4f6; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 14px; word-break: break-all; color: #1f2937;">${token}</div><hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" /><p style="font-size: 12px; color: #9ca3af; margin-bottom: 0;">If you did not expect this project invitation, you can safely ignore this email.</p></div></body></html>`,
    });
  };
}
