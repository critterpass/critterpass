/**
 * The pg_dump child gets its connection from libpq environment variables built from the backup
 * URL: credentials never reach argv, and a verify-full URL verifies against the system trust store
 * because the worker image ships no `~/.postgresql/root.crt`.
 */
import { describe, expect, it } from 'vitest';

import { libpqEnv } from '../../src/jobs/ops/backup';

const HOST = 'postgres://backup:p%40ss@db.example.com:5432/app';

describe('libpqEnv', () => {
  it('maps the URL onto libpq variables', () => {
    expect(libpqEnv(`${HOST}?sslmode=require`)).toEqual({
      PGHOST: 'db.example.com',
      PGPORT: '5432',
      PGUSER: 'backup',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'app',
      PGSSLMODE: 'require',
    });
  });

  it('verifies a verify-full connection against the system trust store', () => {
    const env = libpqEnv(`${HOST}?sslmode=verify-full`);
    expect(env.PGSSLMODE).toBe('verify-full');
    expect(env.PGSSLROOTCERT).toBe('system');
  });

  it('keeps a root certificate the URL names', () => {
    const env = libpqEnv(`${HOST}?sslmode=verify-full&sslrootcert=%2Fetc%2Fca.pem`);
    expect(env.PGSSLROOTCERT).toBe('/etc/ca.pem');
  });

  it('leaves weaker modes and plain local URLs without a root certificate', () => {
    // libpq rejects sslrootcert=system with any mode but verify-full, and without an sslmode it
    // would raise the default to verify-full, which a local server without TLS cannot satisfy.
    expect(libpqEnv(`${HOST}?sslmode=require`).PGSSLROOTCERT).toBeUndefined();
    expect(libpqEnv(`${HOST}?sslmode=verify-ca`).PGSSLROOTCERT).toBeUndefined();
    const local = libpqEnv('postgres://postgres:postgres@localhost/app');
    expect(local.PGSSLROOTCERT).toBeUndefined();
    expect(local.PGSSLMODE).toBeUndefined();
    expect(local.PGPORT).toBe('5432');
  });
});
