import nodemailer from "nodemailer";
import type { SendVerification } from "./register.js";

export function createSmtpVerificationSender(
  smtpUrl: string,
  from: string,
  appOrigin: string,
): SendVerification {
  const transport = nodemailer.createTransport(smtpUrl);
  return async (email, token) => {
    const link = new URL("/verify-email", appOrigin);
    link.hash = new URLSearchParams({ token }).toString();
    await transport.sendMail({
      from,
      to: email,
      subject: "Verify your LaTeX Workspace email",
      text: `Open this link to verify your email address within 24 hours:\n${link.toString()}\n`,
    });
  };
}

export function createSmtpInvitationSender(
  smtpUrl: string,
  from: string,
  appOrigin: string,
): SendVerification {
  const transport = nodemailer.createTransport(smtpUrl);
  return async (email, token) => {
    const link = new URL("/register", appOrigin);
    link.hash = new URLSearchParams({ invitation: token }).toString();
    await transport.sendMail({
      from,
      to: email,
      subject: "Your trusted LaTeX Workspace invitation",
      text: `Open this link to create your trusted account within 24 hours:\n${link.toString()}\n`,
    });
  };
}
