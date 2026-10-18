import { describe, expect, it } from "vitest";
import {
  InMemoryEmailTransport,
  MailpitEmailTransport,
  clearGlobalSentEvents,
  deliverNotificationEmail,
  type NotificationPayload,
} from "../../../apps/jobs/src/notifications/email.js";

describe("Regression COL-13 (S14-T05): Collaboration activity notifications content and delivery channels", () => {
  it("formats collaboration activity notification with snippet, project info, and headers", async () => {
    clearGlobalSentEvents();
    const transport = new InMemoryEmailTransport();

    const payload: NotificationPayload = {
      eventId: "col13-act-001",
      recipientUserId: "user-col13",
      recipientEmail: "collab@example.com",
      type: "reply",
      projectId: "proj-col13",
      projectName: "Quantum Field Theory Notes",
      actorName: "Dr. Feynman",
      contextSnippet: "Equation 4 has a missing factor of h-bar.",
      targetUrl: "https://latex.example.com/project/proj-col13?comment=c123",
    };

    const res = await deliverNotificationEmail(payload, { transport });
    expect(res.delivered).toBe(true);
    expect(transport.sentMessages.length).toBe(1);

    const msg = transport.sentMessages[0]!;
    expect(msg.to).toBe("collab@example.com");
    expect(msg.subject).toBe("[Quantum Field Theory Notes] New reply from Dr. Feynman");
    expect(msg.text).toContain("Equation 4 has a missing factor of h-bar.");
    expect(msg.text).toContain("https://latex.example.com/project/proj-col13?comment=c123");
    expect(msg.html).toContain("Equation 4 has a missing factor of h-bar.");
    expect(msg.html).toContain("<blockquote");
    expect(msg.headers?.["X-Entity-Ref-ID"]).toBe("col13-act-001");
    expect(msg.headers?.["X-Notification-Type"]).toBe("reply");
  });

  it("handles Mailpit transport fallback gracefully when service is unreachable", async () => {
    // Non-existent port to test fallback resilience
    const mailpit = new MailpitEmailTransport("http://127.0.0.1:59999");

    const payload: NotificationPayload = {
      eventId: "col13-mailpit-fallback",
      recipientUserId: "user-fallback",
      recipientEmail: "fallback@example.com",
      type: "mention",
      projectId: "proj-1",
      projectName: "Test Project",
      actorName: "Tester",
      targetUrl: "http://example.com",
    };

    const res = await deliverNotificationEmail(payload, { transport: mailpit });
    expect(res.delivered).toBe(true);
    expect(res.messageId).toContain("mailpit");
  });
});
