import { describe, expect, it } from "vitest";
import { assignableRoles, can, isWorkspaceRole, PERMISSIONS } from "./rbac";

describe("RBAC matrix (docs/10)", () => {
  it("lets every member read workflows", () => {
    for (const role of ["owner", "admin", "editor", "viewer"] as const) {
      expect(can(role, "workflow:read")).toBe(true);
    }
  });

  it("keeps viewers read-only", () => {
    const writes = Object.keys(PERMISSIONS).filter(
      (p) => p !== "workflow:read" && p !== "integration:read"
    ) as (keyof typeof PERMISSIONS)[];
    for (const permission of writes) {
      expect(can("viewer", permission)).toBe(false);
    }
  });

  it("lets editors build and run but not manage secrets or people", () => {
    expect(can("editor", "workflow:write")).toBe(true);
    expect(can("editor", "run:operate")).toBe(true);
    expect(can("editor", "integration:manage")).toBe(false);
    expect(can("editor", "apikey:manage")).toBe(false);
    expect(can("editor", "member:manage")).toBe(false);
  });

  it("reserves billing and deletion for owners", () => {
    expect(can("admin", "workspace:billing")).toBe(false);
    expect(can("admin", "workspace:delete")).toBe(false);
    expect(can("owner", "workspace:delete")).toBe(true);
  });

  it("denies everything without a role", () => {
    expect(can(undefined, "workflow:read")).toBe(false);
  });

  it("never lets admins grant ownership", () => {
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("editor")).toEqual([]);
  });

  it("validates role strings from the database", () => {
    expect(isWorkspaceRole("editor")).toBe(true);
    expect(isWorkspaceRole("member")).toBe(false);
    expect(isWorkspaceRole(null)).toBe(false);
  });
});
