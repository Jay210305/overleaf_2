import { describe, expect, it } from "vitest";
import {
  InMemoryEmailTransport,
  clearGlobalSentEvents,
  deliverNotificationEmail,
  type NotificationPayload,
  type UserNotificationPreferences,
} from "../../../apps/jobs/src/notifications/email.js";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
  type StoredNotificationPreferences,
} from "../../../apps/web/src/features/notifications/preferences.js";

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("Regression ACC-08 (S14-T05): Preference-controlled email & in-app notifications and storage", () => {
  it("loads defaults and persists updated notification preferences in storage", () => {
    const storage = new MockStorage();

    // 1. Initial load falls back to defaults
    const initial = loadNotificationPreferences(storage);
    expect(initial).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(initial.emailMentions).toBe(true);

    // 2. Save custom preferences
    const custom: StoredNotificationPreferences = {
      ...initial,
      emailMentions: false,
      digestFrequency: "daily_digest",
    };
    saveNotificationPreferences(custom, storage);

    // 3. Re-read matches saved
    const reloaded = loadNotificationPreferences(storage);
    expect(reloaded.emailMentions).toBe(false);
    expect(reloaded.digestFrequency).toBe("daily_digest");

    // 4. Corrupted storage returns defaults safely
    storage.setItem("latex_collab_notification_prefs_v1", "INVALID_JSON{{");
    const fallback = loadNotificationPreferences(storage);
    expect(fallback).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it("selectively delivers or suppresses emails according to user preference toggles", async () => {
    clearGlobalSentEvents();
    const transport = new InMemoryEmailTransport();

    // User preferences: invites enabled, replies enabled, mentions disabled
    const userPrefs: UserNotificationPreferences = {
      emailMentions: false,
      emailInvites: true,
      emailReplies: true,
    };

    // 1. Attempt Mention (should be suppressed)
    const mentionPayload: NotificationPayload = {
      eventId: "acc08-mention-1",
      recipientUserId: "user-1",
      recipientEmail: "user1@example.com",
      type: "mention",
      projectId: "proj-1",
      projectName: "Project Alpha",
      actorName: "Colleague",
      targetUrl: "http://example.com/p/1",
    };
    const resMention = await deliverNotificationEmail(mentionPayload, {
      transport,
      preferencesProvider: async () => userPrefs,
    });
    expect(resMention.delivered).toBe(false);
    expect(resMention.suppressedReason).toBe("preferences_disabled_mentions");

    // 2. Attempt Invite (should be delivered)
    const invitePayload: NotificationPayload = {
      eventId: "acc08-invite-1",
      recipientUserId: "user-1",
      recipientEmail: "user1@example.com",
      type: "invite",
      projectId: "proj-2",
      projectName: "Project Beta",
      actorName: "Colleague",
      targetUrl: "http://example.com/p/2",
    };
    const resInvite = await deliverNotificationEmail(invitePayload, {
      transport,
      preferencesProvider: async () => userPrefs,
    });
    expect(resInvite.delivered).toBe(true);
    expect(resInvite.messageId).toBeDefined();

    // 3. Attempt Reply (should be delivered)
    const replyPayload: NotificationPayload = {
      eventId: "acc08-reply-1",
      recipientUserId: "user-1",
      recipientEmail: "user1@example.com",
      type: "reply",
      projectId: "proj-1",
      projectName: "Project Alpha",
      actorName: "Colleague",
      targetUrl: "http://example.com/p/1",
    };
    const resReply = await deliverNotificationEmail(replyPayload, {
      transport,
      preferencesProvider: async () => userPrefs,
    });
    expect(resReply.delivered).toBe(true);
  });
});
