import type { ApplyTextUpdateInput, DurableAck } from "@latex-collab/contracts";

export type SaveStatus = "saved" | "saving" | "offline" | "error";

export type SaveErrorCode =
  "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "SERVICE_UNAVAILABLE" | "NETWORK_ERROR";

export interface SaveError {
  code: SaveErrorCode;
  status?: number;
  message: string;
}

export interface PendingUpdate {
  id: string;
  updateBase64: string;
  baseStateVectorBase64: string;
  timestamp: number;
  retryCount: number;
  resolve: (ack: DurableAck) => void;
  reject: (error: SaveError) => void;
}

export interface SaveTransport {
  save(
    projectId: string,
    fileId: string,
    input: ApplyTextUpdateInput,
  ): Promise<{ ack: DurableAck; [key: string]: unknown }>;
}

export interface TextSaveCoordinatorOptions {
  projectId: string;
  fileId: string;
  transport: SaveTransport;
  onStatusChange?: ((status: SaveStatus) => void) | undefined;
  onError?: ((error: SaveError | null) => void) | undefined;
  onAck?: ((ack: DurableAck) => void) | undefined;
  initialStatus?: SaveStatus | undefined;
  maxRetries?: number | undefined;
  initialBackoffMs?: number | undefined;
  maxBackoffMs?: number | undefined;
  isOnline?: (() => boolean) | undefined;
}

export class TextSaveCoordinator {
  private readonly projectId: string;
  private readonly fileId: string;
  private readonly transport: SaveTransport;
  private readonly onStatusChange?: ((status: SaveStatus) => void) | undefined;
  private readonly onError?: ((error: SaveError | null) => void) | undefined;
  private readonly onAck?: ((ack: DurableAck) => void) | undefined;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly isOnline: () => boolean;

  private status: SaveStatus;
  private lastAck: DurableAck | null = null;
  private lastError: SaveError | null = null;
  private queue: PendingUpdate[] = [];
  private isProcessing = false;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(options: TextSaveCoordinatorOptions) {
    this.projectId = options.projectId;
    this.fileId = options.fileId;
    this.transport = options.transport;
    this.onStatusChange = options.onStatusChange;
    this.onError = options.onError;
    this.onAck = options.onAck;
    this.maxRetries = options.maxRetries ?? 5;
    this.initialBackoffMs = options.initialBackoffMs ?? 100;
    this.maxBackoffMs = options.maxBackoffMs ?? 5000;
    this.isOnline =
      options.isOnline ??
      (() => (typeof navigator !== "undefined" && "onLine" in navigator ? navigator.onLine : true));

    this.status = options.initialStatus ?? "saved";
  }

  public getStatus(): SaveStatus {
    return this.status;
  }

  public getLastAck(): DurableAck | null {
    return this.lastAck;
  }

  public getLastError(): SaveError | null {
    return this.lastError;
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public getPendingUpdates(): readonly PendingUpdate[] {
    return this.queue;
  }

  private setStatus(newStatus: SaveStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.onStatusChange?.(newStatus);
    }
  }

  private setError(error: SaveError | null): void {
    this.lastError = error;
    this.onError?.(error);
  }

  /**
   * Enqueue a new Yjs text update.
   * Note invariant: Local/IndexedDB/socket-only writes CANNOT be reported server-saved.
   * Status immediately transitions to "saving" (or "offline") and only reaches "saved"
   * upon confirmed DurableAck from the server.
   */
  public enqueue(updateBase64: string, baseStateVectorBase64: string): Promise<DurableAck> {
    if (this.destroyed) {
      return Promise.reject(new Error("SaveCoordinator is destroyed"));
    }

    return new Promise<DurableAck>((resolve, reject) => {
      const item: PendingUpdate = {
        id: Math.random().toString(36).slice(2),
        updateBase64,
        baseStateVectorBase64,
        timestamp: Date.now(),
        retryCount: 0,
        resolve,
        reject,
      };

      this.queue.push(item);

      if (!this.isOnline()) {
        this.setStatus("offline");
      } else {
        this.setStatus("saving");
      }

      void this.processQueue();
    });
  }

  public async retry(): Promise<void> {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.queue.length > 0) {
      this.setStatus("saving");
      this.setError(null);
      await this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0 || this.destroyed) {
      return;
    }

    if (!this.isOnline()) {
      this.setStatus("offline");
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0 && !this.destroyed) {
      const head = this.queue[0];
      if (!head) break;

      try {
        const result = await this.transport.save(this.projectId, this.fileId, {
          updateBase64: head.updateBase64,
          baseStateVectorBase64: head.baseStateVectorBase64,
        });

        // Acknowledged by server!
        this.lastAck = result.ack;
        this.setError(null);
        this.onAck?.(result.ack);

        // Dequeue and resolve
        this.queue.shift();
        head.resolve(result.ack);
      } catch (err: unknown) {
        const classified = this.classifyError(err);
        this.setError(classified);

        const isClientError =
          (classified.status !== undefined &&
            classified.status >= 400 &&
            classified.status < 500) ||
          classified.code === "FORBIDDEN" ||
          classified.code === "NOT_FOUND" ||
          classified.code === "CONFLICT";

        if (isClientError) {
          // Fatal client/permission/concurrency errors: do not retry
          this.setStatus("error");
          this.queue.shift();
          head.reject(classified);
          this.isProcessing = false;
          return;
        }

        // Retryable errors: DB outage (503), network outage, offline
        if (classified.code === "SERVICE_UNAVAILABLE" || classified.code === "NETWORK_ERROR") {
          head.retryCount += 1;
          const isNetwork = classified.code === "NETWORK_ERROR";
          this.setStatus(isNetwork && !this.isOnline() ? "offline" : "error");

          if (head.retryCount <= this.maxRetries) {
            const backoff = Math.min(
              this.initialBackoffMs * Math.pow(2, head.retryCount - 1),
              this.maxBackoffMs,
            );
            this.scheduleRetry(backoff);
          } else {
            // Max retries exceeded: reject head and stop
            this.queue.shift();
            head.reject(classified);
            this.isProcessing = false;
            return;
          }

          this.isProcessing = false;
          return;
        }

        // Unknown error: treat as error, drop head to prevent deadlock
        this.setStatus("error");
        this.queue.shift();
        head.reject(classified);
        this.isProcessing = false;
        return;
      }
    }

    this.isProcessing = false;

    if (this.queue.length === 0) {
      this.setStatus("saved");
    }
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    this.retryTimeout = setTimeout(() => {
      this.retryTimeout = null;
      void this.processQueue();
    }, delayMs);
  }

  private classifyError(err: unknown): SaveError {
    if (typeof err === "object" && err !== null) {
      const maybeStatus =
        (err as { status?: number; statusCode?: number }).status ??
        (err as { status?: number; statusCode?: number }).statusCode;
      const maybeCode = (err as { code?: string }).code;
      const maybeMsg = (err as { message?: string }).message ?? "Save operation failed";

      if (maybeStatus === 403 || maybeCode === "FORBIDDEN") {
        return { code: "FORBIDDEN", status: 403, message: maybeMsg };
      }
      if (maybeStatus === 404 || maybeCode === "RESOURCE_NOT_FOUND" || maybeCode === "NOT_FOUND") {
        return { code: "NOT_FOUND", status: 404, message: maybeMsg };
      }
      if (maybeStatus === 409 || maybeCode === "REVISION_CONFLICT" || maybeCode === "CONFLICT") {
        return { code: "CONFLICT", status: 409, message: maybeMsg };
      }
      if (maybeStatus === 503 || maybeCode === "SERVICE_UNAVAILABLE") {
        return { code: "SERVICE_UNAVAILABLE", status: 503, message: maybeMsg };
      }
      if (
        maybeCode === "NETWORK_ERROR" ||
        maybeCode === "ECONNREFUSED" ||
        maybeMsg.includes("Failed to fetch") ||
        maybeMsg.includes("NetworkError") ||
        maybeMsg.includes("network")
      ) {
        return { code: "NETWORK_ERROR", status: 0, message: maybeMsg };
      }
    }
    return {
      code: "NETWORK_ERROR",
      message: err instanceof Error ? err.message : "Unknown persistence error",
    };
  }

  public destroy(): void {
    this.destroyed = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item?.reject({
        code: "NETWORK_ERROR",
        message: "Coordinator destroyed",
      });
    }
  }
}

export function createHttpSaveTransport(
  baseUrl: string,
  options?: {
    csrfToken?: string;
    getHeaders?: () => Record<string, string>;
  },
): SaveTransport {
  return {
    async save(projectId: string, fileId: string, input: ApplyTextUpdateInput) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json",
        ...(options?.csrfToken ? { "x-csrf-token": options.csrfToken } : {}),
        ...(options?.getHeaders ? options.getHeaders() : {}),
      };

      const res = await fetch(`${baseUrl}/projects/${projectId}/files/${fileId}/text`, {
        method: "PUT",
        headers,
        credentials: "include",
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        let errorData: { code?: string; message?: string } = {};
        try {
          errorData = (await res.json()) as { code?: string; message?: string };
        } catch {
          // ignore parse error
        }

        const err: { status: number; code?: string | undefined; message: string } = {
          status: res.status,
          code: errorData.code,
          message: errorData.message ?? `HTTP error ${res.status}`,
        };
        throw err;
      }

      return (await res.json()) as { ack: DurableAck };
    },
  };
}
