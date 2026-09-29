import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fullSuite, selectFlows, shardMatrix, splitShards } from './plan-shards';

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cp-shards-'));
  const files = [
    'e2e/smoke/app-launch.yaml',
    'e2e/home/first-run.yaml',
    'e2e/home/nudge.yaml',
    'e2e/home/subflows/onboard.yaml',
    'e2e/onboarding/first-run-android.yaml',
    'e2e/onboarding/first-run-ios.yaml',
    'e2e/_shared/seed-demo.yaml',
    'e2e/spikes/map-offline.yaml',
    'e2e/critters/capture-perf.sh',
  ];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'appId: app.critterpass.dev\n---\n- launchApp\n');
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('selectFlows', () => {
  it('runs every area flow for the full suite, without subflows, shared flows or spikes', () => {
    expect(fullSuite(root)).toEqual([
      'e2e/home/first-run.yaml',
      'e2e/home/nudge.yaml',
      'e2e/onboarding/first-run-android.yaml',
      'e2e/onboarding/first-run-ios.yaml',
      'e2e/smoke/app-launch.yaml',
    ]);
  });

  it('drops the flows named for the other platform', () => {
    expect(selectFlows('', 'ios', root)).not.toContain('e2e/onboarding/first-run-android.yaml');
    expect(selectFlows('', 'ios', root)).toContain('e2e/onboarding/first-run-ios.yaml');
    expect(selectFlows('e2e/onboarding', 'android', root)).toEqual([
      'e2e/onboarding/first-run-android.yaml',
    ]);
  });

  it('expands files, directories and globs in the order given, once each', () => {
    expect(
      selectFlows('e2e/smoke/app-launch.yaml, e2e/home\ne2e/home/*.yaml', 'ios', root),
    ).toEqual(['e2e/smoke/app-launch.yaml', 'e2e/home/first-run.yaml', 'e2e/home/nudge.yaml']);
  });

  it('rejects inputs that name no flow', () => {
    expect(() => selectFlows('e2e/nothing/*.yaml', 'ios', root)).toThrow(/No flows match/);
    expect(() => selectFlows('e2e/missing.yaml', 'ios', root)).toThrow(/Flow not found/);
  });
});

describe('splitShards', () => {
  it('deals flows round-robin and never makes an empty shard', () => {
    expect(splitShards(['a', 'b', 'c', 'd', 'e'], 3)).toEqual([['a', 'd'], ['b', 'e'], ['c']]);
    expect(splitShards(['a', 'b'], 5)).toEqual([['a'], ['b']]);
    expect(splitShards(['a', 'b'], 0)).toEqual([['a', 'b']]);
  });

  it('builds a 1-based matrix with space-separated flows', () => {
    expect(shardMatrix([['a', 'b'], ['c']])).toEqual({
      include: [
        { shard: 1, flows: 'a b' },
        { shard: 2, flows: 'c' },
      ],
    });
  });
});
