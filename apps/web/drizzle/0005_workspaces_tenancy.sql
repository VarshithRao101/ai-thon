CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip_hash" text,
	"user_agent" text,
	"metadata" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"dek_enc" text,
	"dek_key_version" integer,
	"ai_data_sharing" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" DROP CONSTRAINT "workflow_execution_logs_execution_id_workflow_executions_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_executions" DROP CONSTRAINT "workflow_executions_workflow_id_workflows_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" jsonb DEFAULT '["runs:trigger"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "status" text DEFAULT 'untested' NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_tested_at" timestamp;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_organization_id" text;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "workspace_id" text;--> statement-breakpoint
-- FlowLedger backfill (hand-edited): personal workspace per existing user, then attach tenant rows.
INSERT INTO "workspaces" ("id", "name", "slug", "created_at")
SELECT 'ws_' || u."id", coalesce(nullif(u."name", ''), 'My') || '''s workspace', 'personal-' || lower(u."id"), now()
FROM "users" u WHERE NOT EXISTS (SELECT 1 FROM "members" m WHERE m."user_id" = u."id");--> statement-breakpoint
INSERT INTO "members" ("id", "organization_id", "user_id", "role", "created_at")
SELECT 'mem_' || u."id", 'ws_' || u."id", u."id", 'owner', now()
FROM "users" u WHERE NOT EXISTS (SELECT 1 FROM "members" m WHERE m."user_id" = u."id");--> statement-breakpoint
UPDATE "workflows" w SET "workspace_id" = (SELECT m."organization_id" FROM "members" m WHERE m."user_id" = w."user_id" ORDER BY m."created_at" LIMIT 1) WHERE w."workspace_id" IS NULL;--> statement-breakpoint
UPDATE "workflow_executions" e SET "workspace_id" = w."workspace_id" FROM "workflows" w WHERE e."workflow_id" = w."id" AND e."workspace_id" IS NULL;--> statement-breakpoint
UPDATE "workflow_execution_logs" l SET "workspace_id" = e."workspace_id" FROM "workflow_executions" e WHERE l."execution_id" = e."id" AND l."workspace_id" IS NULL;--> statement-breakpoint
UPDATE "integrations" i SET "workspace_id" = (SELECT m."organization_id" FROM "members" m WHERE m."user_id" = i."user_id" ORDER BY m."created_at" LIMIT 1) WHERE i."workspace_id" IS NULL;--> statement-breakpoint
UPDATE "api_keys" k SET "workspace_id" = (SELECT m."organization_id" FROM "members" m WHERE m."user_id" = k."user_id" ORDER BY m."created_at" LIMIT 1) WHERE k."workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_executions" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_workspaces_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_organization_id_workspaces_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_at_idx" ON "audit_events" USING btree ("workspace_id","at");--> statement-breakpoint
CREATE INDEX "invitations_workspace_idx" ON "invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "members_workspace_user_uq" ON "members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_execution_logs" ADD CONSTRAINT "workflow_execution_logs_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "integrations_workspace_type_idx" ON "integrations" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "execution_logs_execution_idx" ON "workflow_execution_logs" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "executions_workspace_started_idx" ON "workflow_executions" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "executions_workflow_started_idx" ON "workflow_executions" USING btree ("workflow_id","started_at");--> statement-breakpoint
CREATE INDEX "workflows_workspace_updated_idx" ON "workflows" USING btree ("workspace_id","updated_at");