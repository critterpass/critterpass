import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { describe, expect, it } from 'vitest';

import { checkServiceEnv } from './env-check';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const readEnvFile = (file: string) => ({
  ...parseEnv(readFileSync(path.join(repoRoot, file), 'utf8')),
});

describe('env check', () => {
  it.each(['api', 'worker'])('accepts the committed %s .env.example', (service) => {
    expect(checkServiceEnv(service, readEnvFile(`services/${service}/.env.example`))).toEqual({
      service,
      ok: true,
      problems: [],
    });
  });

  it('accepts the root .env.example for both services', () => {
    const env = readEnvFile('.env.example');
    expect(checkServiceEnv('api', env).ok).toBe(true);
    expect(checkServiceEnv('worker', env).ok).toBe(true);
  });

  it('names missing variables without echoing values', () => {
    const result = checkServiceEnv('api', { REDIS_URL: 'redis://secret-host:6379' });
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/DATABASE_URL/);
    expect(result.problems.join('\n')).not.toMatch(/secret-host/);
  });

  it('treats an empty optional value as unset', () => {
    const env = { ...readEnvFile('services/api/.env.example'), SENTRY_DSN: '' };
    expect(checkServiceEnv('api', env).ok).toBe(true);
  });

  it('rejects an unknown service', () => {
    expect(checkServiceEnv('nope', {}).ok).toBe(false);
  });
});
