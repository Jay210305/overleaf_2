import type { EventEnvelope } from "@latex-collab/contracts";

export interface FileRoomNotifier {
  notifyRoomClosed(fileId: string, reason: string): void;
  markFileDeleted(fileId: string): void;
  isFileDeleted(fileId: string): boolean;
}

export class TreeEventSynchronizer {
  private deletedFiles = new Set<string>();
  private filePaths = new Map<string, string>();
  private knownTreeVersions = new Map<string, number>();

  constructor(private readonly notifier?: FileRoomNotifier) {}

  /**
   * Processes a tree invalidation event (e.g. from transactional outbox or Redis).
   */
  handleEvent(event: EventEnvelope): {
    reconcileRequired: boolean;
    roomClosed?: boolean;
    fileId?: string;
  } {
    const { projectId, type, payload } = event;
    const currentVersion = this.knownTreeVersions.get(projectId) ?? 0;
    const incomingVersion = Number(payload.treeVersion ?? 0);

    let reconcileRequired = false;
    if (incomingVersion > 0 && currentVersion > 0 && incomingVersion > currentVersion + 1) {
      // Version gap detected! REST tree refresh must be triggered
      reconcileRequired = true;
    }
    if (incomingVersion > currentVersion) {
      this.knownTreeVersions.set(projectId, incomingVersion);
    }

    const nodeId = String(payload.nodeId ?? payload.fileId ?? "");

    if (type === "file.deleted") {
      this.deletedFiles.add(nodeId);
      this.filePaths.delete(nodeId);
      this.notifier?.markFileDeleted(nodeId);
      this.notifier?.notifyRoomClosed(nodeId, "FILE_DELETED");
      return { reconcileRequired, roomClosed: true, fileId: nodeId };
    }

    if (type === "file.moved") {
      // Renaming a file does NOT change fileId or room ID!
      // Room ID `project:<projectId>:file:<fileId>` remains stable.
      if (payload.newPath) {
        this.filePaths.set(nodeId, String(payload.newPath));
      }
      return { reconcileRequired, roomClosed: false, fileId: nodeId };
    }

    return { reconcileRequired };
  }

  isFileDeleted(fileId: string): boolean {
    return this.deletedFiles.has(fileId);
  }

  getFilePath(fileId: string): string | undefined {
    return this.filePaths.get(fileId);
  }

  getTreeVersion(projectId: string): number {
    return this.knownTreeVersions.get(projectId) ?? 0;
  }
}
