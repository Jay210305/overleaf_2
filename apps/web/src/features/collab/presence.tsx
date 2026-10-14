import React from "react";

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
  currentUserId?: string;
}

export const CollaboratorPresenceList: React.FC<CollaboratorPresenceProps> = ({
  collaborators,
  currentUserId,
}) => {
  return (
    <div
      role="region"
      aria-label="Collaborators"
      data-testid="collaborators-presence-list"
      className="flex items-center space-x-2 py-1 px-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 text-xs"
    >
      <span className="text-gray-500 font-medium">Collaborating:</span>
      <div className="flex items-center -space-x-1.5 overflow-hidden">
        {collaborators.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <div
              key={user.id}
              data-testid={`collaborator-badge-${user.id}`}
              className="relative group cursor-pointer inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-white shadow ring-2 ring-white dark:ring-gray-900 select-none"
              style={{ backgroundColor: user.color }}
              title={`${user.name}${isSelf ? " (you)" : ""}${
                user.activeFileName ? ` - editing ${user.activeFileName}` : ""
              }`}
            >
              <span>{user.name.slice(0, 2).toUpperCase()}</span>

              {/* Hover Tooltip */}
              <div className="absolute top-full mt-1.5 hidden group-hover:flex flex-col z-50 bg-gray-900 text-white rounded px-2 py-1 text-[11px] whitespace-nowrap shadow-lg">
                <span className="font-semibold">
                  {user.name} {isSelf && "(you)"}
                </span>
                {user.activeFileName && (
                  <span className="text-gray-300">File: {user.activeFileName}</span>
                )}
                {user.cursor && (
                  <span className="text-gray-400">
                    Ln {user.cursor.line}, Col {user.cursor.col}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {collaborators.length === 0 && (
        <span className="text-gray-400 italic">No other collaborators active</span>
      )}
    </div>
  );
};
