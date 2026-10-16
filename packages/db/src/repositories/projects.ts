import type { ProjectView } from "@latex-collab/contracts";
import { assertUUID, DatabaseClient, PersistenceError, type UUID } from "../client.js";

export type { ProjectView };

export type ListProjectsInput = {
  cursor?: string | undefined;
  limit: number;
  filter: "owned" | "shared" | "recent" | "archived" | "trashed";
  order: "updatedAt" | "owner";
  tagId?: string | undefined;
  q?: string | undefined;
};

type DecodedCursor = {
  sortValue: string;
  id: string;
};

function encodeCursor(decoded: DecodedCursor): string {
  return Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
}

function decodeCursor(cursor: string, order: "updatedAt" | "owner"): DecodedCursor {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<DecodedCursor>;
    if (typeof parsed.sortValue !== "string" || typeof parsed.id !== "string") {
      throw new Error("Invalid cursor structure");
    }
    assertUUID(parsed.id, "cursor.id");
    if (order === "owner") {
      assertUUID(parsed.sortValue, "cursor.sortValue");
    } else {
      if (Number.isNaN(Date.parse(parsed.sortValue))) {
        throw new Error("Invalid cursor sortValue date");
      }
    }
    return { sortValue: parsed.sortValue, id: parsed.id };
  } catch (error) {
    if (error instanceof PersistenceError) throw error;
    throw new PersistenceError("CONSTRAINT_VIOLATION", "Invalid pagination cursor", false);
  }
}

export class ProjectRepository {
  constructor(private readonly client: DatabaseClient) {}

  async list(
    actorId: UUID,
    input: ListProjectsInput,
  ): Promise<{ items: ProjectView[]; nextCursor: string | null }> {
    assertUUID(actorId, "actorId");

    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const filter = input.filter ?? "owned";
    if (
      filter !== "owned" &&
      filter !== "shared" &&
      filter !== "recent" &&
      filter !== "archived" &&
      filter !== "trashed"
    ) {
      throw new PersistenceError("CONSTRAINT_VIOLATION", `Invalid filter: ${filter}`, false);
    }
    const order = input.order ?? "updatedAt";
    if (order !== "updatedAt" && order !== "owner") {
      throw new PersistenceError("CONSTRAINT_VIOLATION", `Invalid order: ${order}`, false);
    }

    let filterSql = "";
    const params: unknown[] = [actorId];

    if (filter === "owned") {
      filterSql = "p.owner_id = $1 AND p.status = 'active'";
    } else if (filter === "shared") {
      filterSql = `p.id IN (
        SELECT pm.project_id FROM active_project_members pm
        WHERE pm.user_id = $1 AND pm.revoked_at IS NULL AND pm.role != 'OWNER'
      ) AND p.owner_id != $1 AND p.status = 'active'`;
    } else if (filter === "recent") {
      filterSql = `(p.owner_id = $1 OR p.id IN (
        SELECT pm.project_id FROM active_project_members pm
        WHERE pm.user_id = $1 AND pm.revoked_at IS NULL
      )) AND p.status = 'active'`;
    } else if (filter === "archived") {
      filterSql = `(p.owner_id = $1 OR p.id IN (
        SELECT pm.project_id FROM active_project_members pm
        WHERE pm.user_id = $1 AND pm.revoked_at IS NULL
      )) AND p.status = 'archived'`;
    } else if (filter === "trashed") {
      filterSql = "p.owner_id = $1 AND p.status = 'trashed'";
    }

    let searchSql = "";
    if (input.q && input.q.trim().length > 0) {
      params.push(`%${input.q.trim()}%`);
      searchSql = `AND p.title ILIKE $${params.length}`;
    }

    let cursorCondition = "";
    const rawCursor = input.cursor?.trim();
    if (rawCursor) {
      const decoded = decodeCursor(rawCursor, order);
      params.push(decoded.sortValue, decoded.id);
      const valIdx = params.length - 1;
      const idIdx = params.length;

      if (order === "updatedAt") {
        // DESC order: (p.updated_at, p.id) < ($val, $id)
        cursorCondition = `AND (p.updated_at, p.id) < ($${valIdx}::timestamptz, $${idIdx}::uuid)`;
      } else {
        // order === 'owner': (p.owner_id, p.id) > ($val, $id)
        cursorCondition = `AND (p.owner_id, p.id) > ($${valIdx}::uuid, $${idIdx}::uuid)`;
      }
    }

    let tagSql = "";
    if (input.tagId && input.tagId.trim().length > 0) {
      assertUUID(input.tagId, "tagId");
      params.push(input.tagId);
      tagSql = `AND p.id IN (
        SELECT ptl.project_id FROM project_tag_links ptl
        JOIN project_tags pt ON pt.id = ptl.tag_id
        WHERE pt.id = $${params.length} AND pt.user_id = $1
      )`;
    }

    const orderBy =
      order === "updatedAt" ? "p.updated_at DESC, p.id DESC" : "p.owner_id ASC, p.id ASC";

    params.push(limit + 1);
    const limitIdx = params.length;

    const sql = `
      SELECT
        p.id,
        p.owner_id AS "ownerId",
        p.title,
        p.description,
        p.main_file_id AS "mainFileId",
        p.compiler,
        p.status,
        p.current_revision AS "currentRevision",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM projects p
      WHERE ${filterSql}
      ${searchSql}
      ${tagSql}
      ${cursorCondition}
      ORDER BY ${orderBy}
      LIMIT $${limitIdx}
    `;

    const { rows } = await this.client.query<Record<string, unknown>>(sql, params);

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const items: ProjectView[] = slice.map((r) => ({
      id: String(r.id),
      ownerId: String(r.ownerId),
      title: String(r.title),
      description: r.description ? String(r.description) : null,
      mainFileId: r.mainFileId ? String(r.mainFileId) : null,
      compiler: r.compiler as ProjectView["compiler"],
      status: r.status as ProjectView["status"],
      currentRevision: Number(r.currentRevision),
      createdAt: (r.createdAt as Date).toISOString?.() ?? String(r.createdAt),
      updatedAt: (r.updatedAt as Date).toISOString?.() ?? String(r.updatedAt),
    }));

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = slice[slice.length - 1]!;
      const sortValue =
        order === "updatedAt"
          ? ((last.updatedAt as Date).toISOString?.() ?? String(last.updatedAt))
          : String(last.ownerId);
      nextCursor = encodeCursor({ sortValue, id: String(last.id) });
    }

    return { items, nextCursor };
  }
}
