import { describe, expect, it } from 'vitest';

import {
  androidProbe,
  apiTarget,
  preflight,
  PROBE_TRIES,
  type CommandResult,
  type Verdict,
} from './network-preflight';

const target = apiTarget('https://api.example.test/v1/');
const reached: Verdict = { state: 'reached', detail: 'ok' };
const failed: Verdict = { state: 'failed', reason: 'cannot resolve api.example.test' };

/** Runs the pre-flight over a scripted list of probe answers; the last one repeats. */
function walk(answers: Verdict[]) {
  let probes = 0;
  let restarts = 0;
  const result = preflight({
    probe: () => answers[Math.min(probes++, answers.length - 1)] ?? failed,
    restartNetwork: () => {
      restarts += 1;
    },
    pause: () => undefined,
    log: () => undefined,
  });
  return { result, probes, restarts };
}

describe('apiTarget', () => {
  it('reads the host and the default port, and drops the path', () => {
    expect(target).toEqual({
      url: 'https://api.example.test',
      host: 'api.example.test',
      port: 443,
    });
    expect(apiTarget('http://10.0.2.2:8787').port).toBe(8787);
  });

  it('rejects what is not an http url', () => {
    expect(() => apiTarget('ftp://api.example.test')).toThrow(/http/);
    expect(() => apiTarget('staging')).toThrow();
  });
});

describe('preflight', () => {
  it('passes without touching the network when the api answers', () => {
    expect(walk([reached])).toEqual({
      result: { ok: true, restarted: false, line: 'ok' },
      probes: 1,
      restarts: 0,
    });
  });

  it('gives a network that is still coming up a few tries before restarting it', () => {
    const { result, restarts } = walk([failed, failed, reached]);
    expect(result.ok).toBe(true);
    expect(restarts).toBe(0);
  });

  it('restarts the network once and says so when that brings it back', () => {
    const { result, restarts } = walk([...Array<Verdict>(PROBE_TRIES).fill(failed), reached]);
    expect(result).toEqual({ ok: true, restarted: true, line: 'ok (after a network restart)' });
    expect(restarts).toBe(1);
  });

  it('fails after one restart, never a second', () => {
    const { result, restarts, probes } = walk([failed]);
    expect(result.ok).toBe(false);
    expect(result.line).toContain('cannot resolve api.example.test');
    expect(restarts).toBe(1);
    expect(probes).toBe(2 * PROBE_TRIES);
  });

  it('does not fail a shard on a check that could not be made', () => {
    expect(walk([{ state: 'unknown', detail: 'no tool' }]).result.ok).toBe(true);
  });
});

describe('androidProbe', () => {
  const shell =
    (answers: Record<string, CommandResult>) =>
    (command: string): CommandResult => {
      const key = Object.keys(answers).find((prefix) => command.startsWith(prefix));
      return (key ? answers[key] : undefined) ?? { status: 127, output: '' };
    };
  const resolved = {
    status: 1,
    output: 'PING api.example.test (203.0.113.7) 56(84) bytes of data.',
  };

  it('fails on a name that does not resolve, before trying a connection', () => {
    const verdict = androidProbe(
      target,
      shell({ ping: { status: 2, output: 'ping: unknown host api.example.test' } }),
    );
    expect(verdict).toEqual({ state: 'failed', reason: 'cannot resolve api.example.test' });
  });

  it('counts any HTTP answer as reached, even with no echo reply', () => {
    const verdict = androidProbe(
      target,
      shell({
        ping: resolved,
        'command -v curl': { status: 0, output: '/system/bin/curl' },
        curl: { status: 0, output: '404' },
      }),
    );
    expect(verdict).toEqual({
      state: 'reached',
      detail: 'https://api.example.test answered HTTP 404',
    });
  });

  it('fails when the name resolves and the connection does not open', () => {
    const answers = {
      ping: resolved,
      'command -v curl': { status: 0, output: '/system/bin/curl' },
      curl: { status: 7, output: 'curl: (7) Failed to connect' },
    };
    expect(androidProbe(target, shell(answers)).state).toBe('failed');
    const netcat = {
      ping: resolved,
      'command -v nc': { status: 0, output: '/system/bin/nc' },
      nc: { status: 1, output: 'nc: connect: Network is unreachable' },
    };
    expect(androidProbe(target, shell(netcat)).state).toBe('failed');
  });

  it('accepts the lookup alone on an image with no tool to open a connection', () => {
    expect(androidProbe(target, shell({ ping: resolved }))).toEqual({
      state: 'reached',
      detail: 'api.example.test resolves to 203.0.113.7',
    });
  });
});
