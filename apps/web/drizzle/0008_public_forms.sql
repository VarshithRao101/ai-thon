-- FlowLedger (hand-written): public hosted forms.
-- An anonymous visitor's request has no tenant, so RLS hides every workflow.
-- form_target() is the one narrow way in: given a workflow id, it returns the
-- workspace and publish state, and only when the PUBLISHED version starts with
-- a Form trigger. The caller then switches into that workspace's tenant context.
CREATE OR REPLACE FUNCTION form_target(p_workflow_id text)
  RETURNS TABLE (workspace_id text, user_id text, enabled boolean, published_version_id text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT w."workspace_id", w."user_id", w."enabled", w."published_version_id"
    FROM "workflows" w
    JOIN "workflow_versions" v ON v."id" = w."published_version_id"
    WHERE w."id" = p_workflow_id
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v."definition" -> 'nodes') n
        WHERE n -> 'data' ->> 'type' = 'trigger'
          AND n -> 'data' -> 'config' ->> 'triggerType' = 'Form'
      )
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION form_target(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION form_target(text) TO flowledger_app_role;
