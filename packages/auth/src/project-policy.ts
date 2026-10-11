import type { Role } from "@latex-collab/contracts";

export const projectActions = [
  "READ",
  "EDIT",
  "COMPILE",
  "COMMENT",
  "CHAT",
  "SUGGEST",
  "REVIEW",
  "MANAGE_MEMBERS",
  "RESTORE",
  "TRANSFER",
  "DELETE",
  "EXPORT",
] as const;

export type ProjectAction = (typeof projectActions)[number];
export type ProjectCapabilities = Readonly<{ compileAllowed?: boolean; exportAllowed?: boolean }>;

export function isProjectAction(value: unknown): value is ProjectAction {
  return typeof value === "string" && projectActions.some((action) => action === value);
}

/** A missing role, unknown action or absent optional capability always denies access. */
export function allowsProjectAction(
  role: Role | null,
  action: unknown,
  capabilities: ProjectCapabilities = {},
): boolean {
  if (!role || !isProjectAction(action)) return false;
  switch (action) {
    case "READ":
      return true;
    case "EDIT":
      return role === "OWNER" || role === "EDITOR";
    case "COMPILE":
      return role === "OWNER" || role === "EDITOR" || capabilities.compileAllowed === true;
    case "COMMENT":
    case "CHAT":
    case "SUGGEST":
      return role !== "VIEWER";
    case "REVIEW":
      return role === "OWNER" || role === "EDITOR";
    case "MANAGE_MEMBERS":
    case "TRANSFER":
    case "DELETE":
      return role === "OWNER";
    case "RESTORE":
      return role === "OWNER" || role === "EDITOR";
    case "EXPORT":
      return role === "OWNER" || role === "EDITOR" || capabilities.exportAllowed === true;
  }
}
