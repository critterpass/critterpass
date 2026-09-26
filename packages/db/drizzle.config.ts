import { defineConfig } from 'drizzle-kit';

// Migrations are hand-written SQL (packages/db/migrations, see packages/db/sql for the reviewable
// sources); this config exists for drizzle-kit's introspection/drift tooling (`drizzle-kit check`,
// `drizzle-kit studio`) against the Drizzle schema in src/schema, not for `drizzle-kit generate`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  schemaFilter: ['public', 'app', 'ops', 'llm'],
  entities: {
    roles: {
      include: [
        'app_owner',
        'app_user',
        'app_system',
        'guide_reader',
        'powersync_repl',
        'auth',
        'admin_reader',
      ],
    },
  },
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://app_owner:app_owner@localhost:54320/critterpass',
  },
});
