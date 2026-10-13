import type { Role } from "@latex-collab/contracts";

export function canEdit(role?: Role | null): boolean {
  return role === "OWNER" || role === "EDITOR";
}

export function isReadOnly(role?: Role | null): boolean {
  return !canEdit(role);
}

export function canManageMembers(role?: Role | null): boolean {
  return role === "OWNER";
}

export function canCompile(role?: Role | null): boolean {
  // Both editors and owners can compile; viewers/reviewers have read-only views
  return role === "OWNER" || role === "EDITOR";
}

export function getRoleBadge(role?: Role | null): {
  label: string;
  isReadOnly: boolean;
  variant: "success" | "warning" | "neutral";
} {
  switch (role) {
    case "OWNER":
      return { label: "Owner", isReadOnly: false, variant: "success" };
    case "EDITOR":
      return { label: "Editor", isReadOnly: false, variant: "success" };
    case "REVIEWER":
      return { label: "Reviewer", isReadOnly: true, variant: "warning" };
    case "VIEWER":
      return { label: "Viewer", isReadOnly: true, variant: "warning" };
    default:
      return { label: "No Access", isReadOnly: true, variant: "neutral" };
  }
}

export function formatPermissionNotice(role?: Role | null): string | null {
  if (role === "VIEWER") {
    return "Read-only mode (VIEWER): You have viewing permissions only. Edits are disabled.";
  }
  if (role === "REVIEWER") {
    return "Read-only mode (REVIEWER): You have review permissions only. Edits are disabled.";
  }
  if (!role) {
    return "Read-only mode: Unauthorized or missing role.";
  }
  return null;
}
