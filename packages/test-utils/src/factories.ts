import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "@latex-collab/db";

export type UserFixture = {
  id: string;
  emailNormalized: string;
  passwordHash: string;
  displayName: string;
};

export type ProjectFixture = {
  id: string;
  ownerId: string;
  title: string;
  compiler: "pdflatex" | "xelatex" | "lualatex" | "latex";
  status: "active" | "archived" | "trashed";
  currentRevision: number;
};

export type NodeFixture = {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  kind: "FILE" | "FOLDER";
  mime: string;
  sizeBytes: number;
  contentKind: "TEXT" | "BINARY";
  blobKey?: string | null;
};

export function buildUserFixture(overrides: Partial<UserFixture> = {}): UserFixture {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    emailNormalized: overrides.emailNormalized ?? `user-${id.slice(0, 8)}@example.test`,
    passwordHash: overrides.passwordHash ?? "$argon2id$v=19$m=65536,t=3,p=4$fakehash",
    displayName: overrides.displayName ?? `User ${id.slice(0, 8)}`,
  };
}

export function buildProjectFixture(
  ownerId: string,
  overrides: Partial<ProjectFixture> = {},
): ProjectFixture {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    ownerId,
    title: overrides.title ?? `Project ${id.slice(0, 8)}`,
    compiler: overrides.compiler ?? "pdflatex",
    status: overrides.status ?? "active",
    currentRevision: overrides.currentRevision ?? 0,
  };
}

export function buildNodeFixture(
  projectId: string,
  overrides: Partial<NodeFixture> = {},
): NodeFixture {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    projectId,
    parentId: overrides.parentId ?? null,
    name: overrides.name ?? `file-${id.slice(0, 8)}.tex`,
    kind: overrides.kind ?? "FILE",
    mime: overrides.mime ?? "application/x-tex",
    sizeBytes: overrides.sizeBytes ?? 100,
    contentKind: overrides.contentKind ?? "TEXT",
    blobKey: overrides.blobKey ?? null,
  };
}

export async function insertUser(db: DatabaseClient, user: UserFixture): Promise<void> {
  await db.query(
    `INSERT INTO users (id, email_normalized, password_hash, display_name)
     VALUES ($1, $2, $3, $4)`,
    [user.id, user.emailNormalized, user.passwordHash, user.displayName],
  );
}

export async function insertProject(db: DatabaseClient, project: ProjectFixture): Promise<void> {
  await db.query(
    `INSERT INTO projects (id, owner_id, title, compiler, status, current_revision)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      project.id,
      project.ownerId,
      project.title,
      project.compiler,
      project.status,
      project.currentRevision,
    ],
  );
}

export async function insertMember(
  db: DatabaseClient,
  projectId: string,
  userId: string,
  role: "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER",
): Promise<void> {
  await db.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, $3)`,
    [projectId, userId, role],
  );
}

export async function insertNode(db: DatabaseClient, node: NodeFixture): Promise<void> {
  await db.query(
    `INSERT INTO project_nodes (id, project_id, parent_id, name, kind, mime, size_bytes, content_kind, blob_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      node.id,
      node.projectId,
      node.parentId,
      node.name,
      node.kind,
      node.mime,
      node.sizeBytes,
      node.contentKind,
      node.blobKey ?? null,
    ],
  );
}
