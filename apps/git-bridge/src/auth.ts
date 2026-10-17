import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isUUID, type DatabaseClient } from "@latex-collab/db";

export type GitScope = "git:read" | "git:write";

export interface GitTokenRecord {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  scopes: GitScope[];
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export function generateGitToken(): { rawToken: string; tokenHash: string } {
  const rawToken = `glc_git_${randomBytes(24).toString("hex")}`;
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function hashGitToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function parseBasicAuth(header?: string): { username: string; token: string } | null {
  if (!header) return null;
  if (header.startsWith("Bearer ")) {
    return { username: "git", token: header.slice(7).trim() };
  }
  if (!header.startsWith("Basic ")) return null;
  try {
    const credentials = Buffer.from(header.slice(6), "base64").toString("utf8");
    const idx = credentials.indexOf(":");
    if (idx === -1) return null;
    return {
      username: credentials.slice(0, idx),
      token: credentials.slice(idx + 1),
    };
  } catch {
    return null;
  }
}

export interface GitTokenStore {
  createToken(params: {
    userId: string;
    name: string;
    scopes: GitScope[];
    expiresAt?: Date | null;
  }): Promise<{ token: GitTokenRecord; rawToken: string }>;
  findActiveToken(rawToken: string): Promise<GitTokenRecord | null>;
  revokeToken(tokenId: string, userId: string): Promise<boolean>;
  listTokens(userId: string): Promise<GitTokenRecord[]>;
}

export class InMemoryGitTokenStore implements GitTokenStore {
  private tokens = new Map<string, GitTokenRecord>(); // id -> record
  private hashToId = new Map<string, string>(); // tokenHash -> id

  async createToken(params: {
    userId: string;
    name: string;
    scopes: GitScope[];
    expiresAt?: Date | null;
  }): Promise<{ token: GitTokenRecord; rawToken: string }> {
    const { rawToken, tokenHash } = generateGitToken();
    const id = randomUUID();
    const record: GitTokenRecord = {
      id,
      userId: params.userId,
      name: params.name,
      tokenHash,
      scopes: params.scopes,
      createdAt: new Date(),
      expiresAt: params.expiresAt ?? null,
      revokedAt: null,
    };
    this.tokens.set(id, record);
    this.hashToId.set(tokenHash, id);
    return { token: record, rawToken };
  }

  async findActiveToken(rawToken: string): Promise<GitTokenRecord | null> {
    if (!rawToken || !rawToken.startsWith("glc_git_")) return null;
    const hash = hashGitToken(rawToken);
    const id = this.hashToId.get(hash);
    if (!id) return null;
    const record = this.tokens.get(id);
    if (!record) return null;
    if (record.revokedAt !== null) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;
    return record;
  }

  async revokeToken(tokenId: string, userId: string): Promise<boolean> {
    const record = this.tokens.get(tokenId);
    if (!record || record.userId !== userId) return false;
    record.revokedAt = new Date();
    return true;
  }

  async listTokens(userId: string): Promise<GitTokenRecord[]> {
    return Array.from(this.tokens.values()).filter((t) => t.userId === userId && t.revokedAt === null);
  }
}

export const defaultGitTokenStore = new InMemoryGitTokenStore();

export type GitAuthResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; status: number; code: string; message: string };

export async function authenticateGitRequest(params: {
  db?: DatabaseClient | undefined;
  tokenStore?: GitTokenStore | undefined;
  authHeader?: string | undefined;
  projectId: string;
  action: "read" | "write";
}): Promise<GitAuthResult> {
  const store = params.tokenStore ?? defaultGitTokenStore;
  const parsed = parseBasicAuth(params.authHeader);

  if (!parsed || !parsed.token) {
    return {
      ok: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "Git HTTP authentication required; provide a valid Git access token",
    };
  }

  const tokenRecord = await store.findActiveToken(parsed.token);
  if (!tokenRecord) {
    return {
      ok: false,
      status: 401,
      code: "TOKEN_EXPIRED",
      message: "Git access token is invalid, expired, or has been revoked",
    };
  }

  // Check token scope
  if (params.action === "write" && !tokenRecord.scopes.includes("git:write")) {
    return {
      ok: false,
      status: 403,
      code: "INSUFFICIENT_SCOPE",
      message: "Git token does not have 'git:write' permission for push operations",
    };
  }

  // If DatabaseClient is supplied, check project membership and permissions
  if (params.db) {
    if (!isUUID(params.projectId)) {
      return {
        ok: false,
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Repository not found",
      };
    }

    const projRes = await params.db.query<{ owner_id: string; status: string }>(
      `SELECT owner_id, status FROM projects WHERE id = $1`,
      [params.projectId],
    );
    const proj = projRes.rows[0];
    if (!proj || proj.status === "trashed") {
      return {
        ok: false,
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Repository not found",
      };
    }

    if (proj.owner_id === tokenRecord.userId) {
      return { ok: true, userId: tokenRecord.userId, role: "OWNER" };
    }

    const memberRes = await params.db.query<{ role: string }>(
      `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [params.projectId, tokenRecord.userId],
    );
    const member = memberRes.rows[0];
    if (!member) {
      return {
        ok: false,
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Repository not found",
      };
    }

    if (params.action === "write") {
      if (member.role === "VIEWER" || member.role === "REVIEWER") {
        return {
          ok: false,
          status: 403,
          code: "PROJECT_PERMISSION_DENIED",
          message: "Write access denied; git push requires EDITOR or OWNER role",
        };
      }
    }

    return { ok: true, userId: tokenRecord.userId, role: member.role };
  }

  // Standalone fallback when DB client is not injected (e.g. testing)
  return { ok: true, userId: tokenRecord.userId, role: "OWNER" };
}
