-- FlowLedger: Postgres row-level security for tenant isolation (docs/05, docs/10).
--
-- Model:
--   * Migrations (and system jobs) run as the table OWNER, which bypasses RLS.
--   * Request-scoped code connects as a login role that is a member of
--     flowledger_app_role (not owner, not superuser), so these policies apply.
--   * Each tenant transaction runs: select set_config('app.workspace_id', <id>, true)
--     (lib/db/tenant.ts). With no context set, no tenant rows are visible.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flowledger_app_role') THEN
    CREATE ROLE flowledger_app_role NOLOGIN;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO flowledger_app_role;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO flowledger_app_role;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO flowledger_app_role;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flowledger_app_role;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO flowledger_app_role;--> statement-breakpoint

-- The active workspace for the current transaction ('' and unset both mean "none").
CREATE OR REPLACE FUNCTION app_workspace_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.workspace_id', true), '') $$;--> statement-breakpoint

ALTER TABLE "workflows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflows_tenant" ON "workflows"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint
-- Public workflows are readable by anyone (sanitized by the API before returning).
CREATE POLICY "workflows_public_read" ON "workflows" FOR SELECT
  USING ("visibility" = 'public');--> statement-breakpoint

ALTER TABLE "workflow_executions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflow_executions_tenant" ON "workflow_executions"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint

ALTER TABLE "workflow_execution_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflow_execution_logs_tenant" ON "workflow_execution_logs"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint

ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "integrations_tenant" ON "integrations"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_keys_tenant" ON "api_keys"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_events_tenant" ON "audit_events"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint

-- Webhook ingress knows only the presented key, not the workspace. This narrow
-- SECURITY DEFINER lookup (runs as owner) maps a key hash to its workspace and
-- returns nothing for revoked or expired keys. Nothing else crosses tenants.
CREATE OR REPLACE FUNCTION resolve_api_key(p_key_hash text)
  RETURNS TABLE (id text, workspace_id text, user_id text, scopes jsonb)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT k."id", k."workspace_id", k."user_id", k."scopes"
    FROM "api_keys" k
    WHERE k."key_hash" = p_key_hash
      AND k."revoked_at" IS NULL
      AND (k."expires_at" IS NULL OR k."expires_at" > now())
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_api_key(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_api_key(text) TO flowledger_app_role;
