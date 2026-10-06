import { describe, expect, it } from 'vitest';

import { evaluateHeaders } from './headers';
import { coverage, matrixTables, replayMigrations } from './rls-coverage';

describe('RLS coverage from migrations', () => {
  const tables = replayMigrations([
    [
      '2_later.sql',
      `ALTER TABLE notes FORCE ROW LEVEL SECURITY;
       DROP TABLE IF EXISTS scratch CASCADE;
       ALTER PUBLICATION powersync DROP TABLE notes;
       ALTER TABLE old_name RENAME TO new_name;
       GRANT SELECT ON lookup, open_data TO app_user, app_system;`,
    ],
    [
      '1_first.sql',
      `CREATE TABLE notes (id uuid);
       -- ALTER TABLE half FORCE ROW LEVEL SECURITY;
       ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
       CREATE TABLE half (id uuid);
       ALTER TABLE half ENABLE ROW LEVEL SECURITY;
       CREATE TABLE scratch (id uuid);
       CREATE TABLE old_name (id uuid);
       CREATE TABLE lookup (id uuid);
       CREATE TABLE reference (id uuid);
       CREATE TABLE ops.audit (id uuid);
       GRANT SELECT ON reference TO app_system;
       DO $$ DECLARE t text; BEGIN
         FOREACH t IN ARRAY ARRAY['looped', 'old_name'] LOOP
           EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
           EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
           EXECUTE format('GRANT SELECT ON %I TO app_user', t);
         END LOOP;
       END $$;
       CREATE TABLE IF NOT EXISTS looped (id uuid);`,
    ],
  ]);

  it('replays creates, drops, renames and looped statements in file order', () => {
    expect([...tables.keys()].sort()).toEqual([
      'half',
      'lookup',
      'looped',
      'new_name',
      'notes',
      'reference',
    ]);
    expect(tables.get('notes')).toEqual({ rls: true, forced: true, requestRoleGrant: false });
    expect(tables.get('new_name')).toEqual({ rls: true, forced: true, requestRoleGrant: true });
    // The loop ran before `looped` existed, so it changed nothing there.
    expect(tables.get('looped')?.rls).toBe(false);
  });

  it('flags unforced RLS, a missing matrix entry and a request-role grant without RLS', () => {
    const matrix = matrixTables(
      `export const TABLE_MATRIX = {\n  notes: {\n  },\n  ...Object.fromEntries(\n    ['half'].map((t) => [t, {}]),\n  ),\n};`,
    );
    expect([...matrix].sort()).toEqual(['half', 'notes']);
    const result = coverage(tables, matrix);
    expect(result.problems).toEqual([
      'half: RLS enabled but not forced',
      'lookup: the request role holds a grant but the table has no RLS',
      'new_name: no permission matrix entry',
    ]);
    expect(result.withoutRls).toEqual(['looped', 'reference']);
    expect(result.withRls).toBe(3);
  });
});

describe('security headers', () => {
  const good = {
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'geolocation=()',
    server: 'cloudflare',
  };

  it('passes a complete set and ignores a bare server name', () => {
    expect(evaluateHeaders('web', good)).toEqual([]);
    expect(evaluateHeaders('api', good)).toEqual([]);
  });

  it('fails missing transport, sniffing, policy and framing headers on the site', () => {
    const failed = evaluateHeaders('web', { server: 'cloudflare' })
      .filter((f) => f.level === 'fail')
      .map((f) => f.header);
    expect(failed).toEqual([
      'strict-transport-security',
      'x-content-type-options',
      'content-security-policy',
      'x-frame-options',
    ]);
  });

  it('wants only transport and sniffing headers from the API', () => {
    const failed = evaluateHeaders('api', {}).filter((f) => f.level === 'fail');
    expect(failed.map((f) => f.header)).toEqual([
      'strict-transport-security',
      'x-content-type-options',
    ]);
  });

  it('fails a short HSTS lifetime and notes version disclosure and open CORS', () => {
    const findings = evaluateHeaders('api', {
      ...good,
      'strict-transport-security': 'max-age=3600',
      'x-powered-by': 'Hono',
      server: 'nginx/1.27.0',
      'access-control-allow-origin': '*',
    });
    expect(findings.map((f) => `${f.level}:${f.header}`)).toEqual([
      'fail:strict-transport-security',
      'note:access-control-allow-origin',
      'note:x-powered-by',
      'note:server',
    ]);
  });

  it('accepts X-Frame-Options in place of frame-ancestors', () => {
    const findings = evaluateHeaders('web', {
      ...good,
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'DENY',
    });
    expect(findings).toEqual([]);
  });
});
