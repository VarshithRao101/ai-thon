import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Better Auth organization-plugin roles, mapped to N-Flow workspace roles.
 * These govern the plugin's own endpoints (invite, change role, remove member).
 * N-Flow features are checked separately with lib/auth/rbac.ts.
 */
export const ac = createAccessControl(defaultStatements);

export const roles = {
  owner: ac.newRole(ownerAc.statements),
  admin: ac.newRole(adminAc.statements),
  editor: ac.newRole(memberAc.statements),
  viewer: ac.newRole(memberAc.statements),
};
