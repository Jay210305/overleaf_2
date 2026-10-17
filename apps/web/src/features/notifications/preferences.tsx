import React, { useState } from "react";

export interface StoredNotificationPreferences {
  emailMentions: boolean;
  emailInvites: boolean;
  emailReplies: boolean;
  inAppMentions: boolean;
  inAppInvites: boolean;
  inAppReplies: boolean;
  digestFrequency: "immediate" | "daily_digest" | "off";
}

export const DEFAULT_NOTIFICATION_PREFERENCES: StoredNotificationPreferences = {
  emailMentions: true,
  emailInvites: true,
  emailReplies: true,
  inAppMentions: true,
  inAppInvites: true,
  inAppReplies: true,
  digestFrequency: "immediate",
};

const STORAGE_KEY = "latex_collab_notification_prefs_v1";

export function loadNotificationPreferences(
  storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined,
): StoredNotificationPreferences {
  if (!storage) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(
  prefs: StoredNotificationPreferences,
  storage: Storage | undefined = typeof window !== "undefined" ? window.localStorage : undefined,
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export interface NotificationPreferencesProps {
  initialPreferences?: Partial<StoredNotificationPreferences>;
  onSave?: (prefs: StoredNotificationPreferences) => void;
  storage?: Storage;
}

export const NotificationPreferencesPanel: React.FC<NotificationPreferencesProps> = ({
  initialPreferences,
  onSave,
  storage,
}) => {
  const [prefs, setPrefs] = useState<StoredNotificationPreferences>(() => {
    const loaded = loadNotificationPreferences(storage);
    return { ...loaded, ...initialPreferences };
  });

  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  const handleToggle = (key: keyof Omit<StoredNotificationPreferences, "digestFrequency">) => {
    setPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSavedStatus(null);
  };

  const handleFrequencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as StoredNotificationPreferences["digestFrequency"];
    setPrefs((prev) => ({
      ...prev,
      digestFrequency: val,
    }));
    setSavedStatus(null);
  };

  const handleSave = () => {
    saveNotificationPreferences(prefs, storage);
    if (onSave) {
      onSave(prefs);
    }
    setSavedStatus("Preferences saved successfully");
  };

  const handleReset = () => {
    setPrefs(DEFAULT_NOTIFICATION_PREFERENCES);
    saveNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES, storage);
    if (onSave) {
      onSave(DEFAULT_NOTIFICATION_PREFERENCES);
    }
    setSavedStatus("Preferences reset to defaults");
  };

  return (
    <div
      role="region"
      aria-label="Notification Preferences"
      className="p-6 bg-white dark:bg-zinc-900 rounded-lg shadow-sm max-w-xl mx-auto"
    >
      <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
        Notification Preferences
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
        Control how and when you receive collaboration updates, invitations, and comment notifications.
      </p>

      {/* Email Preferences Section */}
      <section className="mb-6">
        <h3 className="text-md font-medium text-zinc-800 dark:text-zinc-200 mb-3">
          Email Notifications
        </h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="emailMentions"
              checked={prefs.emailMentions}
              onChange={() => handleToggle("emailMentions")}
              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Email me when someone @mentions me in a comment
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="emailInvites"
              checked={prefs.emailInvites}
              onChange={() => handleToggle("emailInvites")}
              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Email me when I receive an invitation to collaborate
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="emailReplies"
              checked={prefs.emailReplies}
              onChange={() => handleToggle("emailReplies")}
              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Email me when someone replies to my comment thread
            </span>
          </label>
        </div>
      </section>

      {/* In-App Preferences Section */}
      <section className="mb-6">
        <h3 className="text-md font-medium text-zinc-800 dark:text-zinc-200 mb-3">
          In-App Notifications
        </h3>
        <div className="space-y-3">
          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="inAppMentions"
              checked={prefs.inAppMentions}
              onChange={() => handleToggle("inAppMentions")}
              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Show in-app badge and alert on mentions
            </span>
          </label>

          <label className="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              name="inAppReplies"
              checked={prefs.inAppReplies}
              onChange={() => handleToggle("inAppReplies")}
              className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Show in-app badge on thread replies
            </span>
          </label>
        </div>
      </section>

      {/* Frequency Setting */}
      <section className="mb-6">
        <label htmlFor="digestFrequency" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Digest Frequency
        </label>
        <select
          id="digestFrequency"
          value={prefs.digestFrequency}
          onChange={handleFrequencyChange}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-zinc-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
        >
          <option value="immediate">Immediate (as events happen)</option>
          <option value="daily_digest">Daily Digest</option>
          <option value="off">Off (in-app only)</option>
        </select>
      </section>

      {savedStatus && (
        <div
          role="status"
          className="mb-4 p-2 text-sm text-green-700 bg-green-100 rounded dark:bg-green-900/30 dark:text-green-300"
        >
          {savedStatus}
        </div>
      )}

      {/* Actions */}
      <div className="flex space-x-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md shadow-sm"
        >
          Save Preferences
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 text-sm font-medium rounded-md text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
};
