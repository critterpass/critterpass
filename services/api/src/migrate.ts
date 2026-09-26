import pg from 'pg';

/**
 * Railway pre-deploy step: runs before a new api release takes traffic, over the direct (non-PgBouncer)
 * connection, because DDL, advisory-lock migrators and CREATE INDEX CONCURRENTLY break under
 * transaction pooling. A failure here blocks the deploy.
 */
async function main() {
  const url = process.env['DATABASE_DIRECT_URL'];
  if (!url) throw new Error('DATABASE_DIRECT_URL is required for migrations');

  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const { rows } = await client.query<{ server_version: string }>('show server_version');
    console.log(
      JSON.stringify({ msg: 'database reachable', server_version: rows[0]?.server_version }),
    );
    // Applies the SQL migrations bundled with this release; a release that bundles none is a no-op.
    console.log(JSON.stringify({ msg: 'no migrations bundled with this release' }));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 'migration failed', error: String(error) }));
  process.exit(1);
});
