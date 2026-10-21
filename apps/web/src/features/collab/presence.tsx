import { useMemo } from "react";

export interface CollaboratorUser {
  id: string;
  name: string;
  color: string;
  activeFileId?: string;
  activeFileName?: string;
  cursor?: {
    line: number;
    col: number;
  };
}

export interface CollaboratorPresenceProps {
  collaborators: CollaboratorUser[];
  currentUserId?: string | undefined;
}

const avatarPalette = [
  "#2f9e73",
  "#3f7fd1",
  "#c26a35",
  "#9a5bc9",
  "#0f8f96",
  "#c04a72",
  "#7d8b2f",
  "#5a6b8c",
];

/**
 * Deterministic avatar colour per user so every client renders the same hue
 * for the same collaborator without a server round-trip.
 */
export function collaboratorColor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return avatarPalette[hash % avatarPalette.length]!;
}

/** Two-letter monogram used inside presence avatars. */
export function collaboratorInitials(name: string): string {
  const cleaned = name.trim();
  if (cleaned.length === 0) return "?";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}

/**
 * Circular presence avatars shown in the workspace header (Overleaf-style).
 * Renders nothing else when nobody is connected, keeping the header clean.
 */
export function PresenceAvatars({
  collaborators,
  currentUserId,
  maxVisible = 5,
}: CollaboratorPresenceProps & { maxVisible?: number }) {
  const visible = useMemo(() => collaborators.slice(0, maxVisible), [collaborators, maxVisible]);
  const overflow = collaborators.length - visible.length;
  if (collaborators.length === 0) return null;
  return (
    <div className="ws-presence" role="group" aria-label="Collaborators connected">
      <ul className="ws-presence-list">
        {visible.map((user) => {
          const isSelf = user.id === currentUserId;
          const label = `${user.name}${isSelf ? " (you)" : ""}${
            user.activeFileName ? ` · ${user.activeFileName}` : ""
          }${user.cursor ? ` · Ln ${user.cursor.line}, Col ${user.cursor.col}` : ""}`;
          return (
            <li key={user.id}>
              <span
                className={`ws-presence-avatar${isSelf ? " is-self" : ""}`}
                style={{ backgroundColor: user.color }}
                title={label}
                aria-label={label}
                data-testid={`presence-avatar-${user.id}`}
              >
                {collaboratorInitials(user.name)}
              </span>
            </li>
          );
        })}
        {overflow > 0 && (
          <li>
            <span
              className="ws-presence-avatar is-overflow"
              title={`${overflow} more collaborators`}
            >
              +{overflow}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

/** Legacy inline list kept for callers that still render it in a toolbar. */
export const CollaboratorPresenceList = ({
  collaborators,
  currentUserId,
}: CollaboratorPresenceProps) => {
  if (collaborators.length === 0) {
    return (
      <div
        role="region"
        aria-label="Collaborators"
        data-testid="collaborators-presence-list"
        className="collaborator-bar"
      >
        <span className="collaborator-empty">No other collaborators active</span>
      </div>
    );
  }
  return (
    <div
      role="region"
      aria-label="Collaborators"
      data-testid="collaborators-presence-list"
      className="collaborator-bar"
    >
      <span className="collaborator-label">Collaborating:</span>
      <PresenceAvatars collaborators={collaborators} currentUserId={currentUserId} />
    </div>
  );
};
