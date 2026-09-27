import type pg from 'pg';

export const SPIKE_SCHEMA = 'spike';
export const MESSAGES_TABLE = 'messages';
const QUALIFIED_MESSAGES_TABLE = `${SPIKE_SCHEMA}.${MESSAGES_TABLE}`;

/**
 * Throwaway spike schema (phase-02 "spikes use their own spike_* tables in a spike schema on
 * staging, dropped after the ADR"). Used identically against the Testcontainers image, PlanetScale
 * staging and PlanetScale main so the same code path is exercised locally before it ever touches
 * a shared cloud database.
 *
 * Must run as the role that owns the shared `powersync` publication (`app_owner` on PlanetScale,
 * via `DATABASE_DIRECT_URL` — same as the real schema migrations use per
 * infra/railway/README.md), not this spike's own scoped replication role: Postgres requires
 * `ALTER PUBLICATION ... ADD TABLE` to be run by a role that owns *both* the publication and the
 * table (verified empirically against PlanetScale staging — `must be owner of publication
 * powersync`, then, after creating the table under the spike role instead, `must be owner of
 * table messages`). `replicationRoleUsername`, when given, grants the PowerSync replication
 * connection's own role exactly the access logical replication needs (`USAGE` on the schema,
 * `SELECT` on the table for the initial snapshot — plain Postgres logical-replication
 * requirements, not a PowerSync-specific rule) without making it an owner of anything. Must be
 * the bare Postgres role name, not `pscale role create`'s `username` field verbatim: that field
 * is `<role>.<branch-id>` (e.g. `pscale_api_oua4wu8hge6u.bvls2mz86del`), a PgBouncer/proxy
 * routing identifier — `pg_roles` only knows the role by the part before the dot.
 */
export async function ensureSpikeSchema(pool: pg.Pool, replicationRoleUsername?: string): Promise<void> {
  await pool.query(`create schema if not exists ${SPIKE_SCHEMA}`);
  await pool.query(`
    create table if not exists ${QUALIFIED_MESSAGES_TABLE} (
      id text primary key,
      body text not null,
      created_by text not null,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists ${SPIKE_SCHEMA}.cmd_log (
      op_id text primary key,
      created_at timestamptz not null default now()
    )
  `);
  await pool.query(`
    create table if not exists ${SPIKE_SCHEMA}.cmd_results (
      op_id text primary key references ${SPIKE_SCHEMA}.cmd_log (op_id),
      code text not null,
      message text not null,
      created_at timestamptz not null default now()
    )
  `);
  if (replicationRoleUsername) {
    await pool.query(`grant usage on schema ${SPIKE_SCHEMA} to "${replicationRoleUsername}"`);
    await pool.query(`grant select on ${QUALIFIED_MESSAGES_TABLE} to "${replicationRoleUsername}"`);
  }
}

export async function dropSpikeSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`drop schema if exists ${SPIKE_SCHEMA} cascade`);
}

/**
 * Self-hosted PowerSync's Postgres replication module hardcodes the publication name to
 * `powersync` — not configurable via `service.yaml` (verified against
 * journeyapps/powersync-service v1.26.1, the pinned image tag: `PUBLICATION_NAME = 'powersync'`
 * in its `WalStream.ts`, used unconditionally for `checkSourceConfiguration`,
 * `publication_names` in the replication slot options, and the per-table publication check).
 * Every environment this spike touches (the Testcontainers Postgres image, PlanetScale staging,
 * PlanetScale main) already has a `powersync` publication created by the platform bootstrap
 * migration (real schema tables join it as their own migrations land — data-model-sync-and-
 * privacy.md §1; on PlanetScale staging it already carries the core-schema tables, added by a
 * separate, concurrent migration this spike must not disturb). This spike borrows that one
 * shared publication for the duration of a single run only: add the throwaway table, measure,
 * then remove it. It never creates, drops or renames the publication itself. Same ownership
 * requirement as `ensureSpikeSchema` — call with the owning role's pool.
 */
export async function addSpikeTableToPublication(pool: pg.Pool): Promise<void> {
  await pool.query(`
    do $$ begin
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'powersync' and schemaname = '${SPIKE_SCHEMA}' and tablename = '${MESSAGES_TABLE}'
      ) then
        alter publication powersync add table ${QUALIFIED_MESSAGES_TABLE};
      end if;
    end $$;
  `);
}

export async function removeSpikeTableFromPublication(pool: pg.Pool): Promise<void> {
  const existing = await pool.query(
    `select 1 from pg_publication_tables where pubname = 'powersync' and schemaname = $1 and tablename = $2`,
    [SPIKE_SCHEMA, MESSAGES_TABLE],
  );
  if ((existing.rowCount ?? 0) > 0) {
    await pool.query(`alter publication powersync drop table ${QUALIFIED_MESSAGES_TABLE}`);
  }
}

/**
 * Defensive guard for shared databases (PlanetScale staging/main): the `powersync` publication
 * may legitimately carry real tables already (added by the core-schema migrations, independent
 * of this spike — staging is a live, shared, multi-agent environment, not a fixture this spike
 * owns), so this checks only that no `spike.*` table is present, both before this run adds one
 * and again after cleanup. Never asserts the publication is otherwise empty.
 */
export async function assertNoSpikeTableInPublication(pool: pg.Pool): Promise<void> {
  const rows = await pool.query(
    `select tablename from pg_publication_tables where pubname = 'powersync' and schemaname = $1`,
    [SPIKE_SCHEMA],
  );
  if ((rows.rowCount ?? 0) > 0) {
    throw new Error(
      `s-sync: expected no "${SPIKE_SCHEMA}.*" table in the shared "powersync" publication, found: ${JSON.stringify(rows.rows)}`,
    );
  }
}
