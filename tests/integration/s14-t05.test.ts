import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  InMemoryEmailTransport,
  clearGlobalSentEvents,
  deliverNotificationEmail,
  type NotificationPayload,
} from "../../apps/jobs/src/notifications/email.js";
import { createSessionFixture } from "../helpers/s02-session.js";

describe("S14-T05: Preference-controlled email notifications with permission checks and idempotency", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let ownerUser: { id: string; email: string };
  let memberUser: { id: string; email: string };
  let strangerUser: { id: string; email: string };
  let project: { id: string };
  let transport: InMemoryEmailTransport;

  beforeAll(async () => {
    fixture = await createSessionFixture();
    ownerUser = await fixture.seed();
    memberUser = await fixture.seed();
    strangerUser = await fixture.seed();

    const projRes = await fixture.db.query<{ id: string }>(
      `INSERT INTO projects (title, owner_id, compiler, status)
       VALUES ('Email Notification Test Project', $1, 'pdflatex', 'active')
       RETURNING id`,
      [ownerUser.id],
    );
    project = { id: projRes.rows[0]!.id };

    await fixture.db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'EDITOR')`,
      [project.id, memberUser.id],
    );

    transport = new InMemoryEmailTransport();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("delivers mention email when user has preferences enabled and project membership", async () => {
    clearGlobalSentEvents();
    transport.clear();

    const payload: NotificationPayload = {
      eventId: "evt-mention-001",
      recipientUserId: memberUser.id,
      recipientEmail: memberUser.email,
      type: "mention",
      projectId: project.id,
      projectName: "Email Notification Test Project",
      actorName: "Owner User",
      contextSnippet: "Can you review section 2 please?",
      targetUrl: `http://localhost:3000/project/${project.id}`,
    };

    const result = await deliverNotificationEmail(payload, {
      db: fixture.db,
      transport,
      preferencesProvider: async () => ({
        emailMentions: true,
        emailInvites: true,
        emailReplies: true,
      }),
    });

    expect(result.delivered).toBe(true);
    expect(result.recipientEmail).toBe(memberUser.email);
    expect(transport.sentMessages.length).toBe(1);
    expect(transport.sentMessages[0]!.subject).toContain("mentioned you in a comment");
    expect(transport.sentMessages[0]!.text).toContain("Can you review section 2 please?");
  });

  it("enforces idempotency: replaying same eventId sends only once", async () => {
    const payload: NotificationPayload = {
      eventId: "evt-mention-001", // Replay same eventId
      recipientUserId: memberUser.id,
      recipientEmail: memberUser.email,
      type: "mention",
      projectId: project.id,
      projectName: "Email Notification Test Project",
      actorName: "Owner User",
      targetUrl: `http://localhost:3000/project/${project.id}`,
    };

    const initialCount = transport.sentMessages.length;

    const result = await deliverNotificationEmail(payload, {
      db: fixture.db,
      transport,
    });

    expect(result.delivered).toBe(false);
    expect(result.idempotentSkip).toBe(true);
    expect(result.suppressedReason).toBe("already_delivered");
    expect(transport.sentMessages.length).toBe(initialCount); // Did not send duplicate
  });

  it("suppresses email when recipient preferences disable mentions", async () => {
    const payload: NotificationPayload = {
      eventId: "evt-mention-002",
      recipientUserId: memberUser.id,
      recipientEmail: memberUser.email,
      type: "mention",
      projectId: project.id,
      projectName: "Email Notification Test Project",
      actorName: "Owner User",
      targetUrl: `http://localhost:3000/project/${project.id}`,
    };

    const result = await deliverNotificationEmail(payload, {
      db: fixture.db,
      transport,
      preferencesProvider: async () => ({
        emailMentions: false, // User disabled mentions
        emailInvites: true,
        emailReplies: true,
      }),
    });

    expect(result.delivered).toBe(false);
    expect(result.suppressedReason).toBe("preferences_disabled_mentions");
  });

  it("suppresses email when recipient lacks project permission (stranger or removed member)", async () => {
    const payload: NotificationPayload = {
      eventId: "evt-mention-003",
      recipientUserId: strangerUser.id,
      recipientEmail: strangerUser.email,
      type: "mention",
      projectId: project.id,
      projectName: "Email Notification Test Project",
      actorName: "Owner User",
      targetUrl: `http://localhost:3000/project/${project.id}`,
    };

    const result = await deliverNotificationEmail(payload, {
      db: fixture.db,
      transport,
    });

    expect(result.delivered).toBe(false);
    expect(result.suppressedReason).toBe("recipient_lacks_project_permission");
  });

  it("delivers project invitation email even if recipient is not yet a member", async () => {
    const payload: NotificationPayload = {
      eventId: "evt-invite-001",
      recipientUserId: strangerUser.id,
      recipientEmail: strangerUser.email,
      type: "invite",
      projectId: project.id,
      projectName: "Email Notification Test Project",
      actorName: "Owner User",
      targetUrl: `http://localhost:3000/invite/token123`,
    };

    const result = await deliverNotificationEmail(payload, {
      db: fixture.db,
      transport,
    });

    expect(result.delivered).toBe(true);
    expect(transport.sentMessages.some((m) => m.subject.includes("Invitation to collaborate"))).toBe(true);
  });
});
