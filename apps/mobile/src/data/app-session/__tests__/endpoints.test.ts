/**
 * The build's service endpoints: the staging EAS profile carries every URL the data layer reads,
 * local profiles carry none, and each reader honours the inlined value.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { endpointsConfigSchema } from '@cp/domain';
import { afterEach, describe, expect, it } from '@jest/globals';

import { resolveApiBaseUrl } from '../../places/apiBaseUrl';
import { resolvePowerSyncUrl } from '../../powersync/connector';
import { appEnvironment, endpointsConfigJson, resolveRealtimeUrl } from '../endpoints';

interface EasProfile {
  readonly env?: Record<string, string>;
}
const eas = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../eas.json'), 'utf8')) as {
  build: Record<string, EasProfile>;
};

const ENDPOINT_VARS = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_POWERSYNC_URL',
  'EXPO_PUBLIC_REALTIME_URL',
] as const;

const saved = Object.fromEntries(ENDPOINT_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of ENDPOINT_VARS) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('build endpoints', () => {
  it('points the staging build at the staging api, PowerSync and Centrifugo', () => {
    expect(eas.build['staging']?.env).toMatchObject({
      APP_VARIANT: 'staging',
      EXPO_PUBLIC_API_BASE_URL: 'https://api-staging-de92.up.railway.app',
      EXPO_PUBLIC_POWERSYNC_URL: 'https://powersync-api-staging.up.railway.app',
      EXPO_PUBLIC_REALTIME_URL: 'wss://centrifugo-staging-652b.up.railway.app/connection/websocket',
    });
  });

  it('leaves development and e2e builds on their local values', () => {
    for (const profile of ['development', 'e2e-test', 'preview']) {
      const env = eas.build[profile]?.env ?? {};
      for (const name of ENDPOINT_VARS) expect(env[name]).toBeUndefined();
    }
  });

  it('reads each endpoint from the inlined env, falling back when unset or empty', () => {
    process.env['EXPO_PUBLIC_API_BASE_URL'] = 'http://localhost:8787';
    process.env['EXPO_PUBLIC_POWERSYNC_URL'] = 'http://localhost:8080';
    process.env['EXPO_PUBLIC_REALTIME_URL'] = 'ws://localhost:8000/connection/websocket';
    expect(resolveApiBaseUrl()).toBe('http://localhost:8787');
    expect(resolvePowerSyncUrl()).toBe('http://localhost:8080');
    expect(resolveRealtimeUrl()).toBe('ws://localhost:8000/connection/websocket');

    process.env['EXPO_PUBLIC_REALTIME_URL'] = '';
    expect(resolveRealtimeUrl()).toBe('wss://rt.critterpass.app/connection/websocket');
  });

  it('writes an endpoints config the extensions accept', () => {
    const json = endpointsConfigJson({
      env: appEnvironment('staging'),
      apiBaseUrl: 'https://api-staging-de92.up.railway.app',
      now: new Date('2026-09-28T00:00:00Z'),
    });
    expect(endpointsConfigSchema.parse(JSON.parse(json))).toMatchObject({
      env: 'staging',
      api_base_url: 'https://api-staging-de92.up.railway.app',
    });
    expect(appEnvironment('something-else')).toBe('development');
  });
});
