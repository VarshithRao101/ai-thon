import "server-only";

import { NextResponse } from "next/server";
import { getRequestContext, type RequestContext } from "@/lib/auth/context";
import { can, type Permission } from "@/lib/auth/rbac";
import { runWithTenant } from "@/lib/db/tenant";
import { checkBodySize, checkOrigin, checkRate } from "@/lib/security/guard";

/** Throw from a handler to return a specific status with a safe message. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/** Unexpected errors never leak internals (stack, SQL) to the client. */
export function errorResponse(error: unknown, scope: string): NextResponse {
  if (error instanceof HttpError) {
    return jsonError(error.status, error.message);
  }
  console.error(`[${scope}]`, error);
  return jsonError(500, "Internal server error");
}

type RouteArgs<P> = { params: Promise<P> };

/**
 * Authenticated, workspace-scoped route handler.
 *   401 when signed out, 403 when the role lacks `permission`.
 * The handler runs inside the tenant context, so lib/db/tenant.ts `tdb()`
 * (and therefore Postgres RLS) scopes every query to the active workspace.
 */
export function tenantRoute<P = Record<string, never>>(
  scope: string,
  handler: (
    ctx: RequestContext,
    request: Request,
    params: P
  ) => Promise<Response>,
  options: { permission?: Permission } = {}
) {
  return async (request: Request, args: RouteArgs<P>): Promise<Response> => {
    try {
      const blocked = checkOrigin(request) ?? checkBodySize(request);
      if (blocked) {
        return jsonError(blocked.status, blocked.message);
      }
      const ctx = await getRequestContext(request.headers);
      if (!ctx) {
        return jsonError(401, "Unauthorized");
      }
      const limited = checkRate(ctx.userId, scope);
      if (limited) {
        return jsonError(limited.status, limited.message);
      }
      if (options.permission && !can(ctx.role, options.permission)) {
        return jsonError(403, "Forbidden");
      }
      const params = await args.params;
      return await runWithTenant(ctx, () => handler(ctx, request, params));
    } catch (error) {
      return errorResponse(error, scope);
    }
  };
}

/**
 * Route that works signed in or out (e.g. viewing a public workflow). With a
 * session it runs in the tenant context; without one, `ctx` is null and only
 * `publicDb()` queries make sense.
 */
export function optionalTenantRoute<P = Record<string, never>>(
  scope: string,
  handler: (
    ctx: RequestContext | null,
    request: Request,
    params: P
  ) => Promise<Response>
) {
  return async (request: Request, args: RouteArgs<P>): Promise<Response> => {
    try {
      const blocked = checkOrigin(request) ?? checkBodySize(request);
      if (blocked) {
        return jsonError(blocked.status, blocked.message);
      }
      const ctx = await getRequestContext(request.headers);
      const params = await args.params;
      if (!ctx) {
        return await handler(null, request, params);
      }
      return await runWithTenant(ctx, () => handler(ctx, request, params));
    } catch (error) {
      return errorResponse(error, scope);
    }
  };
}
