import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inTenant, migratedDatabase } from "./pglite";

const WS_A = "ws_a";
const WS_B = "ws_b";

async function seed(pg: PGlite) {
  await pg.exec(`
    INSERT INTO users (id, name, email, created_at, updated_at) VALUES
      ('u_a', 'Alice', 'a@example.test', now(), now()),
      ('u_b', 'Bob',   'b@example.test', now(), now());
    INSERT INTO workspaces (id, name, slug) VALUES
      ('${WS_A}', 'A', 'a'), ('${WS_B}', 'B', 'b');
    INSERT INTO members (id, organization_id, user_id, role) VALUES
      ('m_a', '${WS_A}', 'u_a', 'owner'), ('m_b', '${WS_B}', 'u_b', 'owner');
    INSERT INTO workflows (id, workspace_id, user_id, name, nodes, edges, visibility) VALUES
      ('wf_a',      '${WS_A}', 'u_a', 'A private', '[]', '[]', 'private'),
      ('wf_b',      '${WS_B}', 'u_b', 'B private', '[]', '[]', 'private'),
      ('wf_b_pub',  '${WS_B}', 'u_b', 'B public',  '[]', '[]', 'public');
    INSERT INTO integrations (id, workspace_id, user_id, name, type, config) VALUES
      ('int_a', '${WS_A}', 'u_a', 'A sheets', 'resend', '"sealed"'),
      ('int_b', '${WS_B}', 'u_b', 'B sheets', 'resend', '"sealed"');
    INSERT INTO api_keys (id, workspace_id, user_id, key_hash, key_prefix, revoked_at) VALUES
      ('key_a',       '${WS_A}', 'u_a', 'hash_a',       'flk_a', NULL),
      ('key_revoked', '${WS_B}', 'u_b', 'hash_revoked', 'flk_r', now());
  `);
}

describe("row-level security (tenant isolation)", () => {
  let pg: PGlite;

  beforeAll(async () => {
    pg = await migratedDatabase();
    await seed(pg); // as owner: RLS does not apply
    await pg.exec("SET ROLE flowledger_app_role"); // from now on: the web app's role
  });

  afterAll(async () => {
    await pg.close();
  });

  it("creates a tenant policy on every tenant table", async () => {
    await pg.exec("RESET ROLE");
    const { rows } = await pg.query<{ tablename: string }>(
      "select distinct tablename from pg_policies where schemaname = 'public' order by 1"
    );
    await pg.exec("SET ROLE flowledger_app_role");
    expect(rows.map((r) => r.tablename)).toEqual([
      "api_keys",
      "audit_events",
      "integrations",
      "workflow_execution_logs",
      "workflow_executions",
      "workflows",
    ]);
  });

  it("shows a tenant its own rows plus public workflows only", async () => {
    const { rows } = await inTenant<{ id: string }>(
      pg,
      WS_A,
      "select id from workflows order by id"
    );
    expect(rows.map((r) => r.id)).toEqual(["wf_a", "wf_b_pub"]);
  });

  it("shows nothing private when no workspace context is set", async () => {
    const workflows = await inTenant<{ id: string }>(
      pg,
      null,
      "select id from workflows order by id"
    );
    expect(workflows.rows.map((r) => r.id)).toEqual(["wf_b_pub"]);
    const integrations = await inTenant(
      pg,
      null,
      "select id from integrations"
    );
    expect(integrations.rows).toHaveLength(0);
  });

  it("isolates credentials between workspaces", async () => {
    const { rows } = await inTenant<{ id: string }>(
      pg,
      WS_A,
      "select id from integrations"
    );
    expect(rows.map((r) => r.id)).toEqual(["int_a"]);
  });

  it("rejects writing a row into another workspace", async () => {
    await expect(
      inTenant(
        pg,
        WS_A,
        `insert into workflows (id, workspace_id, user_id, name, nodes, edges)
         values ('wf_evil', '${WS_B}', 'u_a', 'x', '[]', '[]')`
      )
    ).rejects.toThrow("row-level security");
  });

  it("cannot update or delete another workspace's rows, even public ones", async () => {
    const updated = await inTenant(
      pg,
      WS_A,
      "update workflows set name = 'pwned' where id in ('wf_b', 'wf_b_pub')"
    );
    expect(updated.affectedRows).toBe(0);
    const deleted = await inTenant(
      pg,
      WS_A,
      "delete from integrations where id = 'int_b'"
    );
    expect(deleted.affectedRows).toBe(0);
  });

  it("cannot move its own row into another workspace", async () => {
    await expect(
      inTenant(
        pg,
        WS_A,
        `update workflows set workspace_id = '${WS_B}' where id = 'wf_a'`
      )
    ).rejects.toThrow("row-level security");
  });

  it("resolves API keys across tenants only through the definer function", async () => {
    const direct = await inTenant(pg, null, "select id from api_keys");
    expect(direct.rows).toHaveLength(0);

    const live = await inTenant<{ workspace_id: string }>(
      pg,
      null,
      "select * from resolve_api_key($1)",
      ["hash_a"]
    );
    expect(live.rows).toEqual([
      expect.objectContaining({ id: "key_a", workspace_id: WS_A }),
    ]);

    const revoked = await inTenant(
      pg,
      null,
      "select * from resolve_api_key($1)",
      ["hash_revoked"]
    );
    expect(revoked.rows).toHaveLength(0);
  });
});
