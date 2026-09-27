/**
 * infra/centrifugo/config.json must declare exactly the namespaces the api registers, with the
 * catalogue's history, presence and proxy settings: a namespace missing there is denied by
 * Centrifugo before the subscribe proxy is ever called.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { RT_CORE_NAMESPACES } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { listNamespaces } from '../../src/realtime/namespaces';

interface CentrifugoNamespace {
  readonly name: string;
  readonly subscribe_proxy_enabled?: boolean;
  readonly publish_proxy_enabled?: boolean;
  readonly allow_user_limited_channels?: boolean;
  readonly presence?: boolean;
  readonly join_leave?: boolean;
  readonly allow_presence_for_subscriber?: boolean;
  readonly history_size?: number;
  readonly history_ttl?: string;
  readonly force_recovery?: boolean;
}

interface CentrifugoConfig {
  readonly http_server: { readonly port: string; readonly internal_port: string };
  readonly admin?: { readonly enabled?: boolean };
  readonly client: { readonly token: { readonly audience: string } };
  readonly channel: {
    readonly proxy: { readonly subscribe: object; readonly publish: object };
    readonly namespaces: readonly CentrifugoNamespace[];
  };
  readonly engine: { readonly type: string };
}

const config = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../infra/centrifugo/config.json'),
    'utf8',
  ),
) as CentrifugoConfig;

describe('infra/centrifugo/config.json', () => {
  it('verifies rt-audience tokens and uses the Redis engine', () => {
    expect(config.client.token.audience).toBe('rt');
    expect(config.engine.type).toBe('redis');
  });

  it('keeps the server API off the public port', () => {
    // The internal port carries the server API and /health and is reached only over the private
    // network; the public port (the one the domain targets) serves the client websocket.
    expect(config.http_server.port).toBe('8000');
    expect(config.http_server.internal_port).toBe('9000');
    expect(config.admin?.enabled ?? false).toBe(false);
  });

  it('declares exactly the registered namespaces', () => {
    expect(config.channel.namespaces.map((ns) => ns.name).sort()).toEqual(
      listNamespaces()
        .map((ns) => ns.name)
        .sort(),
    );
  });

  it('matches the catalogue for every core namespace', () => {
    for (const spec of RT_CORE_NAMESPACES) {
      const ns = config.channel.namespaces.find((candidate) => candidate.name === spec.name);
      expect(ns, spec.name).toBeDefined();
      expect(ns?.subscribe_proxy_enabled, spec.name).toBe(true);
      expect(ns?.publish_proxy_enabled ?? false, spec.name).toBe(spec.clientPublish !== undefined);
      expect(ns?.allow_user_limited_channels ?? false, spec.name).toBe(spec.name === 'user');
      expect(ns?.presence ?? false, spec.name).toBe(spec.presence);
      expect(ns?.join_leave ?? false, spec.name).toBe(spec.presence);
      expect(ns?.allow_presence_for_subscriber ?? false, spec.name).toBe(spec.presence);
      if (spec.history === null) {
        expect(ns?.history_size, spec.name).toBeUndefined();
        expect(ns?.force_recovery ?? false, spec.name).toBe(false);
      } else {
        expect(ns?.history_size, spec.name).toBe(spec.history.size);
        expect(ns?.history_ttl, spec.name).toBe(`${spec.history.ttlSeconds / 3600}h`);
        expect(ns?.force_recovery, spec.name).toBe(true);
      }
    }
  });
});
