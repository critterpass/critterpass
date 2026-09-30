import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CHANNEL_NAMESPACES } from '@cp/domain';
import { describe, expect, it } from 'vitest';

const configPath = path.resolve(import.meta.dirname, '../../infra/centrifugo/config.json');

interface Namespace {
  name: string;
  subscribe_proxy_enabled?: boolean;
  history_size?: number;
  force_recovery?: boolean;
}

function configuredNamespaces(): Namespace[] {
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
    channel: { namespaces: Namespace[] };
  };
  return config.channel.namespaces;
}

describe('centrifugo namespaces', () => {
  it('declares every channel namespace the domain publishes on', () => {
    // Centrifugo rejects a publish to an undeclared namespace with "102 unknown channel",
    // so the rt_outbox relay would fail every row for it.
    const declared = new Set(configuredNamespaces().map((ns) => ns.name));
    const missing = CHANNEL_NAMESPACES.filter((name) => !declared.has(name));
    expect(missing).toEqual([]);
  });

  it('declares no namespace the domain does not know', () => {
    const known = new Set<string>(CHANNEL_NAMESPACES);
    const unknown = configuredNamespaces()
      .map((ns) => ns.name)
      .filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
  });

  it('authorises every subscription through the api subscribe proxy', () => {
    const open = configuredNamespaces()
      .filter((ns) => ns.subscribe_proxy_enabled !== true)
      .map((ns) => ns.name);
    expect(open).toEqual([]);
  });

  it('keeps recovery only where history exists', () => {
    const broken = configuredNamespaces()
      .filter((ns) => ns.force_recovery === true && !(ns.history_size && ns.history_size > 0))
      .map((ns) => ns.name);
    expect(broken).toEqual([]);
  });
});
