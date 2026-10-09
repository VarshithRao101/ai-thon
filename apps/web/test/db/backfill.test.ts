import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyMigrations, migrationTags } from "./pglite";

// Upgrading a database that already holds template-era data (pre-workspaces).
describe("0005 workspace backfill", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();
    const before = migrationTags().indexOf("0005_workspaces_tenancy") - 1;
    await applyMigrations(pg, { to: before });
    await pg.exec(`
      INSERT INTO users (id, name, email, created_at, updated_at)
        VALUES ('u_old', 'Old', 'old@example.test', now(), now());
      INSERT INTO workflows (id, user_id, name, nodes, edges)
        VALUES ('wf_old', 'u_old', 'Legacy', '[]', '[]');
      INSERT INTO workflow_executions (id, workflow_id, user_id, status)
        VALUES ('ex_old', 'wf_old', 'u_old', 'success');
      INSERT INTO workflow_execution_logs (id, execution_id, node_id, node_name, node_type, status)
        VALUES ('log_old', 'ex_old', 'n1', 'Trigger', 'trigger', 'success');
      INSERT INTO integrations (id, user_id, name, type, config)
        VALUES ('int_old', 'u_old', 'Legacy', 'resend', '"x"');
    `);
    await applyMigrations(pg, { from: before + 1 });
  });

  afterAll(async () => {
    await pg.close();
  });

  it("gives every existing user an owned personal workspace", async () => {
    const { rows } = await pg.query<{ role: string; name: string }>(
      `select m.role, w.name from members m join workspaces w on w.id = m.organization_id
       where m.user_id = 'u_old'`
    );
    expect(rows).toEqual([{ role: "owner", name: "Old's workspace" }]);
  });

  it("attaches every tenant row to that workspace", async () => {
    const { rows } = await pg.query<{ t: string; ws: string }>(`
      select 'workflows' t, workspace_id ws from workflows
      union all select 'executions', workspace_id from workflow_executions
      union all select 'logs', workspace_id from workflow_execution_logs
      union all select 'integrations', workspace_id from integrations`);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.ws))).toEqual(new Set(["ws_u_old"]));
  });
});
