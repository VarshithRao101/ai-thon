import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { IntegrationType } from "../types/integration";
import { generateId } from "../utils/id";

// Workspace roles (docs/10 RBAC matrix). Stored as text in members.role.
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type WorkspacePlan = "free" | "pro" | "business";

// ---------------------------------------------------------------------------
// Identity: Better Auth core tables (no RLS: auth needs cross-tenant lookups)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // Anonymous user tracking
  isAnonymous: boolean("is_anonymous").default(false),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Better Auth organization plugin: the workspace this session acts in
  activeOrganizationId: text("active_organization_id"),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ---------------------------------------------------------------------------
// Workspaces: Better Auth organization plugin (organization/member/invitation)
// plus N-Flow columns. Field keys must match Better Auth field names.
// ---------------------------------------------------------------------------

export const workspaces = pgTable("workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  plan: text("plan").notNull().default("free").$type<WorkspacePlan>(),
  // Vault: workspace data-encryption key, wrapped by a versioned master key
  dekEnc: text("dek_enc"),
  dekKeyVersion: integer("dek_key_version"),
  aiDataSharing: boolean("ai_data_sharing").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
});

export const members = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer").$type<WorkspaceRole>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("members_workspace_user_uq").on(t.organizationId, t.userId),
    index("members_user_idx").on(t.userId),
  ]
);

export const invitations = pgTable(
  "invitations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<WorkspaceRole>(),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("invitations_workspace_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
  ]
);

// ---------------------------------------------------------------------------
// Tenant data: every row carries workspace_id and is protected by Postgres
// row-level security (drizzle/0006_*_rls.sql). userId = creator ("created by").
// ---------------------------------------------------------------------------

// Workflow visibility type
export type WorkflowVisibility = "private" | "public";

export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "success"
  | "error"
  | "cancelled"
  | "skipped";
export type ExecutionTrigger =
  | "manual"
  | "webhook"
  | "form"
  | "schedule"
  | "retry";

export const workflows = pgTable(
  "workflows",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    nodes: jsonb("nodes").notNull().$type<any[]>(),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    edges: jsonb("edges").notNull().$type<any[]>(),
    visibility: text("visibility")
      .notNull()
      .default("private")
      .$type<WorkflowVisibility>(),
    // Triggers (webhook/form/schedule) only fire for enabled, published workflows
    enabled: boolean("enabled").notNull().default(false),
    publishedVersionId: text("published_version_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("workflows_workspace_updated_idx").on(t.workspaceId, t.updatedAt),
  ]
);

// Immutable published snapshots; runs reference the exact definition they executed
export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition")
      .notNull()
      // biome-ignore lint/suspicious/noExplicitAny: JSONB type - { nodes, edges } snapshot
      .$type<{ nodes: any[]; edges: any[] }>(),
    // sha256 of the canonical (RFC 8785) JSON of `definition`
    definitionHash: text("definition_hash").notNull(),
    publishedBy: text("published_by").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("workflow_versions_workflow_version_uq").on(
      t.workflowId,
      t.version
    ),
  ]
);

// Integrations table: credentials sealed with the workspace data key (lib/vault)
export const integrations = pgTable(
  "integrations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    type: text("type").notNull().$type<IntegrationType>(),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - encrypted credentials stored as JSON
    config: jsonb("config").notNull().$type<any>(),
    // Whether this integration was created via OAuth (managed by app) vs manual entry
    isManaged: boolean("is_managed").default(false),
    status: text("status")
      .notNull()
      .default("untested")
      .$type<"ok" | "error" | "untested">(),
    lastTestedAt: timestamp("last_tested_at"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("integrations_workspace_type_idx").on(t.workspaceId, t.type)]
);

// Workflow executions table to track workflow runs
export const workflowExecutions = pgTable(
  "workflow_executions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().$type<ExecutionStatus>(),
    trigger: text("trigger")
      .notNull()
      .default("manual")
      .$type<ExecutionTrigger>(),
    // Published runs point at a version; draft test runs carry their own snapshot
    versionId: text("version_id").references(() => workflowVersions.id, {
      onDelete: "set null",
    }),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - { nodes, edges } draft snapshot
    definition: jsonb("definition").$type<{ nodes: any[]; edges: any[] }>(),
    idempotencyKey: text("idempotency_key"),
    jobId: text("job_id"),
    // Times the queue delivered this run (crash recovery increments it)
    attempt: integer("attempt").notNull().default(0),
    queuedAt: timestamp("queued_at").notNull().defaultNow(),
    heartbeatAt: timestamp("heartbeat_at"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    input: jsonb("input").$type<Record<string, any>>(),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    output: jsonb("output").$type<any>(),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    duration: text("duration"), // Duration in milliseconds
  },
  (t) => [
    index("executions_workspace_started_idx").on(t.workspaceId, t.startedAt),
    index("executions_workflow_started_idx").on(t.workflowId, t.startedAt),
    uniqueIndex("executions_idempotency_uq")
      .on(t.workflowId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("executions_active_idx")
      .on(t.status)
      .where(sql`${t.status} in ('queued', 'running', 'waiting')`),
  ]
);

// Workflow execution logs to track individual node executions
export const workflowExecutionLogs = pgTable(
  "workflow_execution_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    executionId: text("execution_id")
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeName: text("node_name").notNull(),
    nodeType: text("node_type").notNull(),
    status: text("status")
      .notNull()
      .$type<
        "pending" | "running" | "success" | "error" | "skipped" | "waiting"
      >(),
    attempt: integer("attempt").notNull().default(1),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    input: jsonb("input").$type<any>(),
    // Redacted preview for display
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - structure validated at application level
    output: jsonb("output").$type<any>(),
    // Full output sealed with the workspace key: rebuilds context on resume (D-018)
    outputEnc: text("output_enc"),
    branch: text("branch"),
    error: text("error"),
    errorClass: text("error_class"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    duration: text("duration"), // Duration in milliseconds
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (t) => [index("execution_logs_execution_idx").on(t.executionId)]
);

// API keys for webhook authentication (sha256-hashed at rest)
export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name"), // Optional label for the API key
    keyHash: text("key_hash").notNull(), // Store hashed version of the key
    keyPrefix: text("key_prefix").notNull(), // Store first few chars for display (e.g., "flk_abc...")
    scopes: jsonb("scopes")
      .notNull()
      .default(["runs:trigger"])
      .$type<string[]>(),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
  },
  (t) => [uniqueIndex("api_keys_key_hash_uq").on(t.keyHash)]
);

// Security audit trail (docs/10): who did what, in which workspace
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - free-form context per action
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_workspace_at_idx").on(t.workspaceId, t.at)]
);

// Proof-of-Execution tables (docs/08): unused since D-053 removed the blockchain layer; kept so existing databases need no destructive migration.
// A batch covers receipts from many workspaces,
// so ledger_batches is global: it holds only roots and chain metadata.
export type LedgerBatchStatus =
  | "building"
  | "submitted"
  | "confirmed"
  | "failed";

export const ledgerBatches = pgTable(
  "ledger_batches",
  {
    id: serial("id").primaryKey(),
    chainBatchId: integer("chain_batch_id"),
    merkleRoot: text("merkle_root").notNull(),
    leafCount: integer("leaf_count").notNull(),
    chainId: integer("chain_id").notNull(),
    contractAddress: text("contract_address").notNull(),
    txHash: text("tx_hash"),
    blockNumber: text("block_number"),
    gasUsed: text("gas_used"),
    status: text("status").notNull().$type<LedgerBatchStatus>(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [index("ledger_batches_status_idx").on(t.status)]
);

export type ReceiptStatus = "pending" | "anchored";

// One receipt per settled run (a retried run gets a new version). Holds hashes
// and ids only; the salt never leaves the database.
export const receipts = pgTable(
  "receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    executionId: text("execution_id")
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - ReceiptV1 from @flowledger/ledger
    receipt: jsonb("receipt").notNull().$type<any>(),
    receiptHash: text("receipt_hash").notNull(),
    // 16 random bytes (hex). Deleting it makes the anchored hashes unlinkable.
    salt: text("salt"),
    prevReceiptHash: text("prev_receipt_hash"),
    batchId: integer("batch_id").references(() => ledgerBatches.id, {
      onDelete: "set null",
    }),
    leafIndex: integer("leaf_index"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - bytes32[] Merkle proof
    proof: jsonb("proof").$type<any>(),
    status: text("status").notNull().default("pending").$type<ReceiptStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    anchoredAt: timestamp("anchored_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("receipts_execution_version_uq").on(t.executionId, t.version),
    uniqueIndex("receipts_hash_uq").on(t.receiptHash),
    index("receipts_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("receipts_pending_idx")
      .on(t.status)
      .where(sql`${t.status} = 'pending'`),
  ]
);

// Demo tamper simulator (docs/08): every simulated edit is on the record.
export const tamperEvents = pgTable(
  "tamper_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => generateId()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    executionId: text("execution_id")
      .notNull()
      .references(() => workflowExecutions.id, { onDelete: "cascade" }),
    logId: text("log_id").notNull(),
    nodeId: text("node_id").notNull(),
    field: text("field").notNull(),
    // The untouched ciphertext, so "Restore" puts the original back exactly.
    originalOutputEnc: text("original_output_enc"),
    // biome-ignore lint/suspicious/noExplicitAny: JSONB type - the redacted preview before the edit
    originalOutput: jsonb("original_output").$type<any>(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
  },
  (t) => [index("tamper_events_execution_idx").on(t.executionId)]
);

// Relations
export const workflowExecutionsRelations = relations(
  workflowExecutions,
  ({ one }) => ({
    workflow: one(workflows, {
      fields: [workflowExecutions.workflowId],
      references: [workflows.id],
    }),
  })
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Workflow = typeof workflows.$inferSelect;
export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
export type WorkflowExecutionLog = typeof workflowExecutionLogs.$inferSelect;
export type NewWorkflowExecutionLog = typeof workflowExecutionLogs.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type LedgerBatch = typeof ledgerBatches.$inferSelect;
export type TamperEvent = typeof tamperEvents.$inferSelect;
