import { verifyAdminCliToken } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { buildCliRequest } from './cmd';

const env = {
  ADMIN_API_ORIGIN: 'https://api.example.test/',
  ADMIN_CLI_EMAIL: 'owner@critterpass.test',
  BETTER_AUTH_SECRET: 'local-development-only-auth-secret-not-for-staging',
};

describe('admin:cmd', () => {
  it('signs a short-lived owner token and builds one admin envelope', async () => {
    const now = new Date();
    const request = await buildCliRequest(
      {
        argv: ['set_feature_flag', '{"key":"seat.cap_free"}'],
        env: { ...env, CF_ACCESS_TOKEN: 'jwt' },
      },
      now,
    );
    expect(request.url).toBe('https://api.example.test/v1/admin/cmd/set_feature_flag');
    expect(request.headers['cf-access-jwt-assertion']).toBe('jwt');
    const token = request.headers['authorization']?.replace('CP-Admin-CLI ', '') ?? '';
    expect(await verifyAdminCliToken(token, env.BETTER_AUTH_SECRET, now)).toMatchObject({
      email: 'owner@critterpass.test',
    });
    const body = JSON.parse(request.body) as {
      cmd: string;
      actor: { via: string };
      payload: unknown;
    };
    expect(body).toMatchObject({ cmd: 'set_feature_flag', actor: { via: 'admin' } });
    expect(body.payload).toEqual({ key: 'seat.cap_free' });
  });

  it('refuses a bad command name, bad JSON and a missing secret without echoing values', async () => {
    await expect(buildCliRequest({ argv: ['Drop Tables'], env })).rejects.toThrow(/usage/);
    await expect(buildCliRequest({ argv: ['ban_user', '{nope'], env })).rejects.toThrow(/JSON/);
    await expect(
      buildCliRequest({ argv: ['ban_user', '{}'], env: { ...env, BETTER_AUTH_SECRET: '' } }),
    ).rejects.toThrow('BETTER_AUTH_SECRET is not set');
  });
});
