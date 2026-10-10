CREATE TABLE "ledger_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_batch_id" integer,
	"merkle_root" text NOT NULL,
	"leaf_count" integer NOT NULL,
	"chain_id" integer NOT NULL,
	"contract_address" text NOT NULL,
	"tx_hash" text,
	"block_number" text,
	"gas_used" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"execution_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"receipt" jsonb NOT NULL,
	"receipt_hash" text NOT NULL,
	"salt" text,
	"prev_receipt_hash" text,
	"batch_id" integer,
	"leaf_index" integer,
	"proof" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anchored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tamper_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"execution_id" text NOT NULL,
	"log_id" text NOT NULL,
	"node_id" text NOT NULL,
	"field" text NOT NULL,
	"original_output_enc" text,
	"original_output" jsonb,
	"actor_user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_batch_id_ledger_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ledger_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tamper_events" ADD CONSTRAINT "tamper_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tamper_events" ADD CONSTRAINT "tamper_events_execution_id_workflow_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tamper_events" ADD CONSTRAINT "tamper_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_batches_status_idx" ON "ledger_batches" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_execution_version_uq" ON "receipts" USING btree ("execution_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_hash_uq" ON "receipts" USING btree ("receipt_hash");--> statement-breakpoint
CREATE INDEX "receipts_workspace_created_idx" ON "receipts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "receipts_pending_idx" ON "receipts" USING btree ("status") WHERE "receipts"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "tamper_events_execution_idx" ON "tamper_events" USING btree ("execution_id");--> statement-breakpoint
-- FlowLedger (hand-written): tenant isolation for receipts and tamper events.
-- ledger_batches is global (roots + chain metadata only, no tenant data).
ALTER TABLE "receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "receipts_tenant" ON "receipts"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint
ALTER TABLE "tamper_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tamper_events_tenant" ON "tamper_events"
  USING ("workspace_id" = app_workspace_id())
  WITH CHECK ("workspace_id" = app_workspace_id());--> statement-breakpoint
-- Public verification (docs/08): anyone with a run id may read its latest
-- receipt and batch data. Never the salt, never step data.
CREATE OR REPLACE FUNCTION public_receipt(p_execution_id text)
  RETURNS TABLE (
    execution_id text, version integer, receipt jsonb, receipt_hash text, status text,
    created_at timestamptz, anchored_at timestamptz, leaf_index integer, proof jsonb,
    merkle_root text, chain_batch_id integer, chain_id integer, contract_address text,
    tx_hash text, block_number text, batch_status text, confirmed_at timestamptz,
    tamper_count bigint
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT r."execution_id", r."version", r."receipt", r."receipt_hash", r."status",
           r."created_at", r."anchored_at", r."leaf_index", r."proof",
           b."merkle_root", b."chain_batch_id", b."chain_id", b."contract_address",
           b."tx_hash", b."block_number", b."status", b."confirmed_at",
           (SELECT count(*) FROM "tamper_events" t
             WHERE t."execution_id" = r."execution_id" AND t."restored_at" IS NULL)
    FROM "receipts" r
    LEFT JOIN "ledger_batches" b ON b."id" = r."batch_id"
    WHERE r."execution_id" = p_execution_id
    ORDER BY r."version" DESC
    LIMIT 1
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public_receipt(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_receipt(text) TO flowledger_app_role;--> statement-breakpoint
-- Chain continuity: this receipt and the ones before it in the same workspace.
CREATE OR REPLACE FUNCTION public_receipt_chain(p_execution_id text, p_limit integer)
  RETURNS TABLE (execution_id text, receipt jsonb, receipt_hash text, created_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    WITH me AS (
      SELECT r."workspace_id", r."created_at"
      FROM "receipts" r
      WHERE r."execution_id" = p_execution_id
      ORDER BY r."version" DESC
      LIMIT 1
    )
    SELECT r."execution_id", r."receipt", r."receipt_hash", r."created_at"
    FROM "receipts" r, me
    WHERE r."workspace_id" = me."workspace_id" AND r."created_at" <= me."created_at"
    ORDER BY r."created_at" DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public_receipt_chain(text, integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public_receipt_chain(text, integer) TO flowledger_app_role;
