CREATE TABLE "workflow_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"workflow_id" text NOT NULL,
	"version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"definition_hash" text NOT NULL,
	"published_by" text,
	"published_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "output_enc" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "error_class" text;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "trigger" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "version_id" text;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "definition" jsonb;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "job_id" text;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "queued_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "heartbeat_at" timestamp;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "published_version_id" text;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_versions_workflow_version_uq" ON "workflow_versions" USING btree ("workflow_id","version");--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "executions_idempotency_uq" ON "workflow_executions" USING btree ("workflow_id","idempotency_key") WHERE "workflow_executions"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "executions_active_idx" ON "workflow_executions" USING btree ("status") WHERE "workflow_executions"."status" in ('queued', 'running', 'waiting');--> statement-breakpoint
-- FlowLedger (hand-written): tenant isolation + immutability for published versions.
ALTER TABLE "workflow_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workflow_versions_tenant" ON "workflow_versions"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_update() RETURNS trigger
  LANGUAGE plpgsql
  AS $$ BEGIN RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME; END $$;--> statement-breakpoint
CREATE TRIGGER "workflow_versions_immutable" BEFORE UPDATE ON "workflow_versions"
  FOR EACH ROW EXECUTE FUNCTION forbid_update();
