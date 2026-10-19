import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmailSenders } from "../../apps/api/src/modules/auth/mail.js";

afterEach(() => vi.unstubAllGlobals());

describe("authentication email transport", () => {
  const config = {
    APP_ORIGIN: "https://workspace.example",
    RESEND_API_KEY: "re_test_private",
    EMAIL_FROM: "onboarding@resend.dev",
    SMTP_URL: "smtp://unused.example",
  };

  it("uses HTTPS for all account and invitation links when Resend is configured", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"id":"accepted"}'));
    vi.stubGlobal("fetch", fetcher);
    const senders = createEmailSenders(config)!;
    for (const send of Object.values(senders)) await send("writer@example.com", "secret-token");
    expect(fetcher).toHaveBeenCalledTimes(4);
    const bodies = fetcher.mock.calls.map(([url, init]) => {
      expect(url).toBe("https://api.resend.com/emails");
      expect(init).toMatchObject({
        method: "POST",
        redirect: "error",
        headers: { Authorization: "Bearer re_test_private" },
      });
      return JSON.parse(init.body);
    });
    expect(bodies.map((body) => body.text)).toEqual([
      expect.stringContaining("https://workspace.example/verify-email#token=secret-token"),
      expect.stringContaining("https://workspace.example/register#invitation=secret-token"),
      expect.stringContaining("https://workspace.example/reset-password#token=secret-token"),
      expect.stringContaining("https://workspace.example/invitations#token=secret-token"),
    ]);
    expect(
      bodies.every(
        (body) => body.from === config.EMAIL_FROM && body.to[0] === "writer@example.com",
      ),
    ).toBe(true);
  });

  it("rejects provider failures without exposing credentials or provider response bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private-provider-body", { status: 403 })),
    );
    await expect(
      createEmailSenders(config)!.sendInvitation("writer@example.com", "secret-token"),
    ).rejects.toThrow("Email delivery failed (HTTP 403)");
  });

  it("redacts network errors and does not fall back to SMTP", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("re_test_private secret-token"));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      createEmailSenders(config)!.sendVerification("writer@example.com", "secret-token"),
    ).rejects.toThrow(/^Email delivery unavailable$/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires a sender and transport, while retaining SMTP support", () => {
    expect(createEmailSenders({ APP_ORIGIN: config.APP_ORIGIN })).toBeUndefined();
    expect(
      createEmailSenders({ APP_ORIGIN: config.APP_ORIGIN, RESEND_API_KEY: config.RESEND_API_KEY }),
    ).toBeUndefined();
    expect(
      createEmailSenders({
        APP_ORIGIN: config.APP_ORIGIN,
        EMAIL_FROM: config.EMAIL_FROM,
        SMTP_URL: "smtp://localhost:1025",
      })?.sendVerification,
    ).toBeTypeOf("function");
  });
});
