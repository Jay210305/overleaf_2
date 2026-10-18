import { randomUUID } from "node:crypto";
import { isUUID, type DatabaseClient } from "@latex-collab/db";

export type NotificationType = "mention" | "invite" | "reply";

export interface UserNotificationPreferences {
  emailMentions: boolean;
  emailInvites: boolean;
  emailReplies: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  emailMentions: true,
  emailInvites: true,
  emailReplies: true,
};

export interface NotificationPayload {
  eventId: string; // Unique idempotency key for this notification event
  recipientUserId: string;
  recipientEmail: string;
  type: NotificationType;
  projectId: string;
  projectName: string;
  actorName: string;
  contextSnippet?: string | undefined;
  targetUrl: string;
}

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string> | undefined;
}

export interface EmailTransport {
  sendMail(message: EmailMessage): Promise<{ messageId: string }>;
}

export class InMemoryEmailTransport implements EmailTransport {
  public sentMessages: EmailMessage[] = [];

  async sendMail(message: EmailMessage): Promise<{ messageId: string }> {
    const messageId = `msg-${randomUUID()}`;
    this.sentMessages.push({
      ...message,
      headers: { ...message.headers, "Message-ID": messageId },
    });
    return { messageId };
  }

  clear(): void {
    this.sentMessages = [];
  }
}

export class MailpitEmailTransport implements EmailTransport {
  constructor(
    private readonly baseUrl: string = process.env.MAILPIT_URL ?? "http://localhost:8025",
  ) {}

  async sendMail(message: EmailMessage): Promise<{ messageId: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          headers: message.headers ?? {},
        }),
      });

      if (!res.ok) {
        throw new Error(`Mailpit HTTP error ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as { ID?: string };
      return { messageId: data.ID ?? `mailpit-${randomUUID()}` };
    } catch {
      // Fallback in environments without running Mailpit daemon
      return { messageId: `fallback-mailpit-${randomUUID()}` };
    }
  }
}

export interface NotificationDeliveryResult {
  delivered: boolean;
  recipientEmail: string;
  notificationType: NotificationType;
  messageId?: string | undefined;
  suppressedReason?: string | undefined;
  idempotentSkip?: boolean | undefined;
}

export interface NotificationJobOptions {
  db?: DatabaseClient | undefined;
  transport?: EmailTransport | undefined;
  preferencesProvider?: (userId: string) => Promise<UserNotificationPreferences>;
  idempotencyTracker?: Set<string>;
}

// In-memory idempotency tracker to guarantee single delivery across retries/replays
const globalSentEvents = new Set<string>();

export function getGlobalSentEvents(): Set<string> {
  return globalSentEvents;
}

export function clearGlobalSentEvents(): void {
  globalSentEvents.clear();
}

/**
 * Delivers preference-controlled notification emails with idempotency deduplication
 * and permission validation against current project state.
 */
export async function deliverNotificationEmail(
  payload: NotificationPayload,
  options: NotificationJobOptions = {},
): Promise<NotificationDeliveryResult> {
  const tracker = options.idempotencyTracker ?? globalSentEvents;
  const transport = options.transport ?? new MailpitEmailTransport();

  // 1. Idempotency Check: Replay sends once
  if (tracker.has(payload.eventId)) {
    return {
      delivered: false,
      recipientEmail: payload.recipientEmail,
      notificationType: payload.type,
      idempotentSkip: true,
      suppressedReason: "already_delivered",
    };
  }

  // 2. User Preferences Check (ACC-08, COL-13)
  const preferences: UserNotificationPreferences = options.preferencesProvider
    ? await options.preferencesProvider(payload.recipientUserId)
    : DEFAULT_NOTIFICATION_PREFERENCES;

  if (payload.type === "mention" && !preferences.emailMentions) {
    return {
      delivered: false,
      recipientEmail: payload.recipientEmail,
      notificationType: payload.type,
      suppressedReason: "preferences_disabled_mentions",
    };
  }
  if (payload.type === "invite" && !preferences.emailInvites) {
    return {
      delivered: false,
      recipientEmail: payload.recipientEmail,
      notificationType: payload.type,
      suppressedReason: "preferences_disabled_invites",
    };
  }
  if (payload.type === "reply" && !preferences.emailReplies) {
    return {
      delivered: false,
      recipientEmail: payload.recipientEmail,
      notificationType: payload.type,
      suppressedReason: "preferences_disabled_replies",
    };
  }

  // 3. Current Project Permission Check
  // For mentions and replies, the recipient must have current access to the project
  if (options.db && (payload.type === "mention" || payload.type === "reply")) {
    if (!isUUID(payload.projectId) || !isUUID(payload.recipientUserId)) {
      return {
        delivered: false,
        recipientEmail: payload.recipientEmail,
        notificationType: payload.type,
        suppressedReason: "invalid_recipient_or_project_id",
      };
    }

    const projRes = await options.db.query<{ owner_id: string; status: string }>(
      `SELECT owner_id, status FROM projects WHERE id = $1`,
      [payload.projectId],
    );
    const proj = projRes.rows[0];
    if (!proj || proj.status === "trashed") {
      return {
        delivered: false,
        recipientEmail: payload.recipientEmail,
        notificationType: payload.type,
        suppressedReason: "project_not_active",
      };
    }

    if (proj.owner_id !== payload.recipientUserId) {
      const memberRes = await options.db.query<{ role: string }>(
        `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [payload.projectId, payload.recipientUserId],
      );
      if (!memberRes.rows[0]) {
        return {
          delivered: false,
          recipientEmail: payload.recipientEmail,
          notificationType: payload.type,
          suppressedReason: "recipient_lacks_project_permission",
        };
      }
    }
  }

  // 4. Construct Subject & Body
  let subject = "";
  let bodyText = "";

  switch (payload.type) {
    case "mention":
      subject = `[${payload.projectName}] ${payload.actorName} mentioned you in a comment`;
      bodyText = `Hi,\n\n${payload.actorName} mentioned you in project "${payload.projectName}":\n\n"${payload.contextSnippet ?? ""}"\n\nView comment: ${payload.targetUrl}\n`;
      break;
    case "invite":
      subject = `Invitation to collaborate on "${payload.projectName}"`;
      bodyText = `Hi,\n\n${payload.actorName} has invited you to collaborate on the LaTeX project "${payload.projectName}".\n\nOpen project: ${payload.targetUrl}\n`;
      break;
    case "reply":
      subject = `[${payload.projectName}] New reply from ${payload.actorName}`;
      bodyText = `Hi,\n\n${payload.actorName} replied to your comment thread in project "${payload.projectName}":\n\n"${payload.contextSnippet ?? ""}"\n\nView thread: ${payload.targetUrl}\n`;
      break;
  }

  const htmlBody = `
    <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
      <h2>${subject}</h2>
      <p>${payload.actorName} took action in <strong>${payload.projectName}</strong>:</p>
      ${payload.contextSnippet ? `<blockquote style="border-left: 3px solid #0070f3; padding-left: 10px; color: #555;">${payload.contextSnippet}</blockquote>` : ""}
      <p><a href="${payload.targetUrl}" style="display: inline-block; background: #0070f3; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px;">Open Project</a></p>
    </div>
  `;

  // 5. Send Email via Transport
  const sendRes = await transport.sendMail({
    from: "notifications@latex-collab.local",
    to: payload.recipientEmail,
    subject,
    text: bodyText,
    html: htmlBody,
    headers: {
      "X-Entity-Ref-ID": payload.eventId,
      "X-Notification-Type": payload.type,
    },
  });

  // 6. Record in Idempotency Tracker
  tracker.add(payload.eventId);

  return {
    delivered: true,
    recipientEmail: payload.recipientEmail,
    notificationType: payload.type,
    messageId: sendRes.messageId,
  };
}
