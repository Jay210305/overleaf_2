import React, { useState, useCallback, useMemo } from "react";

export interface TabSelection {
  anchor: number;
  head: number;
}

export interface TabCursor {
  line: number;
  col: number;
  head: number;
}

export interface TabState {
  fileId: string;
  fileName: string;
  projectId: string;
  content: string;
  cursor?: TabCursor;
  selection?: TabSelection;
  scrollTop?: number;
  scrollLeft?: number;
  undoHistory?: Array<{ type: "insert" | "delete"; position: number; text: string }>;
  isDirty?: boolean;
}

export interface EditorTabsProps {
  tabs: TabState[];
  activeFileId: string | null;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string) => void;
  notification?: { fileId: string; fileName: string; reason: string } | null;
  onDismissNotification?: () => void;
}

export class TabSessionManager {
  private tabs: Map<string, TabState> = new Map();
  private activeId: string | null = null;
  private tabOrder: string[] = [];
  private deletedNotification: { fileId: string; fileName: string; reason: string } | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(initialTabs: TabState[] = [], activeId?: string | null) {
    for (const tab of initialTabs) {
      this.tabs.set(tab.fileId, { ...tab });
      this.tabOrder.push(tab.fileId);
    }
    this.activeId = activeId ?? (this.tabOrder.length > 0 ? this.tabOrder[0]! : null);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public getTabs(): TabState[] {
    return this.tabOrder.map((id) => this.tabs.get(id)!).filter(Boolean);
  }

  public getActiveTabId(): string | null {
    return this.activeId;
  }

  public getActiveTab(): TabState | null {
    return this.activeId ? this.tabs.get(this.activeId) ?? null : null;
  }

  public getTab(fileId: string): TabState | undefined {
    return this.tabs.get(fileId);
  }

  public getNotification(): { fileId: string; fileName: string; reason: string } | null {
    return this.deletedNotification;
  }

  public clearNotification(): void {
    this.deletedNotification = null;
    this.notify();
  }

  public openTab(tab: { fileId: string; fileName: string; projectId: string; content?: string }): void {
    if (this.tabs.has(tab.fileId)) {
      this.activeId = tab.fileId;
    } else {
      const newTab: TabState = {
        fileId: tab.fileId,
        fileName: tab.fileName,
        projectId: tab.projectId,
        content: tab.content ?? "",
        cursor: { line: 1, col: 1, head: 0 },
        selection: { anchor: 0, head: 0 },
        scrollTop: 0,
        scrollLeft: 0,
        undoHistory: [],
        isDirty: false,
      };
      this.tabs.set(tab.fileId, newTab);
      this.tabOrder.push(tab.fileId);
      this.activeId = tab.fileId;
    }
    this.notify();
  }

  public switchTab(targetFileId: string): void {
    if (this.tabs.has(targetFileId)) {
      this.activeId = targetFileId;
      this.notify();
    }
  }

  public updateTabBuffer(
    fileId: string,
    updates: Partial<Omit<TabState, "fileId" | "projectId">>,
  ): void {
    const existing = this.tabs.get(fileId);
    if (!existing) return;

    this.tabs.set(fileId, {
      ...existing,
      ...updates,
    });
    this.notify();
  }

  public closeTab(fileId: string): void {
    const idx = this.tabOrder.indexOf(fileId);
    if (idx === -1) return;

    this.tabOrder.splice(idx, 1);
    this.tabs.delete(fileId);

    if (this.activeId === fileId) {
      if (this.tabOrder.length > 0) {
        // Activate adjacent tab
        const nextIdx = Math.min(idx, this.tabOrder.length - 1);
        this.activeId = this.tabOrder[nextIdx] ?? null;
      } else {
        this.activeId = null;
      }
    }
    this.notify();
  }

  /**
   * Closes a tab when the file is deleted or returns 404,
   * setting a visible notification with the specific reason.
   */
  public handleFileDeleted(fileId: string, reason = "File was deleted or removed (404)"): void {
    const tab = this.tabs.get(fileId);
    const fileName = tab?.fileName ?? fileId;

    this.closeTab(fileId);
    this.deletedNotification = {
      fileId,
      fileName,
      reason,
    };
    this.notify();
  }
}

export function useTabSession(initialTabs: TabState[] = [], initialActiveId?: string | null) {
  const [manager] = useState(() => new TabSessionManager(initialTabs, initialActiveId));
  const [, setTick] = useState(0);

  React.useEffect(() => {
    return manager.subscribe(() => setTick((t) => t + 1));
  }, [manager]);

  const tabs = useMemo(() => manager.getTabs(), [manager]);
  const activeFileId = manager.getActiveTabId();
  const notification = manager.getNotification();

  const selectTab = useCallback((id: string) => manager.switchTab(id), [manager]);
  const closeTab = useCallback((id: string) => manager.closeTab(id), [manager]);
  const openTab = useCallback(
    (tab: { fileId: string; fileName: string; projectId: string; content?: string }) =>
      manager.openTab(tab),
    [manager],
  );
  const updateTab = useCallback(
    (fileId: string, updates: Partial<Omit<TabState, "fileId" | "projectId">>) =>
      manager.updateTabBuffer(fileId, updates),
    [manager],
  );
  const handleFileDeleted = useCallback(
    (fileId: string, reason?: string) => manager.handleFileDeleted(fileId, reason),
    [manager],
  );
  const dismissNotification = useCallback(() => manager.clearNotification(), [manager]);

  return {
    manager,
    tabs,
    activeFileId,
    activeTab: manager.getActiveTab(),
    notification,
    selectTab,
    closeTab,
    openTab,
    updateTab,
    handleFileDeleted,
    dismissNotification,
  };
}

export const EditorTabs: React.FC<EditorTabsProps> = ({
  tabs,
  activeFileId,
  onSelectTab,
  onCloseTab,
  notification,
  onDismissNotification,
}) => {
  return (
    <div className="flex flex-col w-full bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      {notification && (
        <div
          role="alert"
          data-testid="tab-deleted-notification"
          className="bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 text-xs px-3 py-1.5 flex items-center justify-between border-b border-amber-300 dark:border-amber-800"
        >
          <span>
            <strong>{notification.fileName}</strong> was closed: {notification.reason}
          </span>
          <button
            type="button"
            data-testid="dismiss-deleted-notification"
            onClick={onDismissNotification}
            className="text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 font-bold ml-2 text-sm"
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Editor tabs"
        data-testid="editor-tablist"
        className="flex items-center space-x-1 px-1 pt-1 overflow-x-auto scrollbar-none"
      >
        {tabs.map((tab) => {
          const isActive = tab.fileId === activeFileId;
          return (
            <div
              key={tab.fileId}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              data-testid={`tab-${tab.fileId}`}
              data-active={isActive ? "true" : "false"}
              onClick={() => onSelectTab(tab.fileId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(tab.fileId);
                }
              }}
              className={`group flex items-center space-x-2 px-3 py-1.5 text-xs font-medium rounded-t border-t border-l border-r transition-colors cursor-pointer select-none ${
                isActive
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 font-semibold"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-300 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              <span className="truncate max-w-[120px]" title={tab.fileName}>
                {tab.fileName}
              </span>
              {tab.isDirty && (
                <span
                  data-testid={`dirty-indicator-${tab.fileId}`}
                  className="w-1.5 h-1.5 rounded-full bg-blue-500"
                  title="Unsaved changes"
                />
              )}
              <button
                type="button"
                data-testid={`close-tab-${tab.fileId}`}
                aria-label={`Close tab ${tab.fileName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.fileId);
                }}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded p-0.5 hover:bg-gray-300 dark:hover:bg-gray-700"
              >
                &times;
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
