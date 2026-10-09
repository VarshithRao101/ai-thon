import type { WorkspaceRole } from "@/lib/db/schema";

/** RBAC matrix from docs/10. Keep in sync with the table there. */
export const PERMISSIONS = {
  "workflow:read": ["owner", "admin", "editor", "viewer"],
  "workflow:write": ["owner", "admin", "editor"],
  "run:operate": ["owner", "admin", "editor"],
  "submission:read": ["owner", "admin", "editor"],
  "integration:read": ["owner", "admin", "editor", "viewer"],
  "integration:manage": ["owner", "admin"],
  "apikey:manage": ["owner", "admin"],
  "member:manage": ["owner", "admin"],
  "audit:read": ["owner", "admin"],
  "vault:rotate": ["owner", "admin"],
  "demo:tamper": ["owner", "admin"],
  "workspace:billing": ["owner"],
  "workspace:delete": ["owner"],
} as const satisfies Record<string, readonly WorkspaceRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = [
  "owner",
  "admin",
  "editor",
  "viewer",
];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

export function can(
  role: WorkspaceRole | undefined,
  permission: Permission
): boolean {
  if (!role) {
    return false;
  }
  return (PERMISSIONS[permission] as readonly WorkspaceRole[]).includes(role);
}

/** Roles an actor may grant to others: admins never create or demote owners. */
export function assignableRoles(actor: WorkspaceRole): WorkspaceRole[] {
  if (actor === "owner") {
    return ["owner", "admin", "editor", "viewer"];
  }
  if (actor === "admin") {
    return ["admin", "editor", "viewer"];
  }
  return [];
}
