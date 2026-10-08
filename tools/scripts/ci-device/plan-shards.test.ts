import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEFAULT_FLOW_MINUTES, flowMinutes } from './flow-durations';
import { DEFAULT_FLOWS, selectFlows, shardMatrix, shardMinutes, splitShards } from './plan-shards';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'cp-shards-'));
  const files = [
    'e2e/smoke/app-launch.yaml',
    'e2e/happy/onboarding.yaml',
    'e2e/happy/vote.yaml',
    'e2e/happy/money.yaml',
    'e2e/happy/chat.yaml',
    'e2e/home/first-run.yaml',
    'e2e/home/nudge.yaml',
    'e2e/home/subflows/onboard.yaml',
    'e2e/onboarding/first-run-android.yaml',
    'e2e/onboarding/first-run-ios.yaml',
    'e2e/_shared/seed-demo.yaml',
    'e2e/spikes/map-offline.yaml',
    'e2e/critters/capture-perf.sh',
    'e2e/sweep/seed-vote-en.yaml',
    'e2e/sweep/seed-vote-vi.yaml',
    'e2e/sweep/seed-trip-hub-en.yaml',
    'e2e/sweep/lab-plan-views-en.yaml',
  ];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), 'appId: app.critterpass.dev\n---\n- launchApp\n');
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('selectFlows', () => {
  it('runs the three default journeys, not every flow, when none is named', () => {
    for (const platform of ['ios', 'android'] as const)
      expect(selectFlows(' ', platform, root)).toEqual([
        'e2e/happy/onboarding.yaml',
        'e2e/happy/vote.yaml',
        'e2e/happy/money.yaml',
      ]);
    expect(DEFAULT_FLOWS.filter((flow) => !existsSync(path.join(REPO_ROOT, flow)))).toEqual([]);
  });

  it('drops the flows named for the other platform', () => {
    expect(selectFlows('e2e/onboarding', 'ios', root)).toEqual([
      'e2e/onboarding/first-run-ios.yaml',
    ]);
    expect(selectFlows('e2e/onboarding', 'android', root)).toEqual([
      'e2e/onboarding/first-run-android.yaml',
    ]);
  });

  it('expands files, directories and globs in the order given, once each', () => {
    expect(
      selectFlows('e2e/smoke/app-launch.yaml, e2e/home\ne2e/home/*.yaml', 'ios', root),
    ).toEqual(['e2e/smoke/app-launch.yaml', 'e2e/home/first-run.yaml', 'e2e/home/nudge.yaml']);
  });

  it("keeps the iPhone sweep's pattern to the seed flows in English, without the Android one", () => {
    expect(selectFlows('e2e/sweep/seed-!(trip-hub*)-en.yaml', 'ios', root)).toEqual([
      'e2e/sweep/seed-vote-en.yaml',
    ]);
  });

  it('rejects inputs that name no flow', () => {
    expect(() => selectFlows('e2e/nothing/*.yaml', 'ios', root)).toThrow(/No flows match/);
    expect(() => selectFlows('e2e/missing.yaml', 'ios', root)).toThrow(/Flow not found/);
  });
});

describe('splitShards', () => {
  it('never makes an empty shard, and keeps equal flows in the order given', () => {
    const equal = () => 5;
    expect(splitShards(['a', 'b', 'c', 'd', 'e'], 3, equal)).toEqual([
      ['a', 'd'],
      ['b', 'e'],
      ['c'],
    ]);
    expect(splitShards(['a', 'b'], 5, equal)).toEqual([['a'], ['b']]);
    expect(splitShards(['a', 'b'], 0, equal)).toEqual([['a', 'b']]);
  });

  it('balances shards by total time instead of by count', () => {
    const minutes: Record<string, number> = { long: 31, mid: 13, a: 4, b: 4, c: 3, d: 3, e: 3 };
    const of = (flow: string) => minutes[flow] ?? 5;
    const flows = ['a', 'long', 'b', 'mid', 'c', 'd', 'e'];
    const shards = splitShards(flows, 2, of);
    // The long flow has a shard to itself; dealt by turns it would share one with 10 more minutes.
    expect(shards).toEqual([['long'], ['a', 'b', 'mid', 'c', 'd', 'e']]);
    expect(shards.map((shard) => shardMinutes(shard, of))).toEqual([31, 30]);
    expect(shards.flat().sort()).toEqual([...flows].sort());
  });

  it('uses the recorded medians, and a default for a flow with none', () => {
    expect(flowMinutes('e2e/happy/fresh-join-under-way.yaml')).toBeGreaterThan(25);
    expect(flowMinutes('e2e/somewhere/new-flow.yaml')).toBe(DEFAULT_FLOW_MINUTES);
    const shards = splitShards(
      [
        'e2e/happy/fresh-join-under-way.yaml',
        'e2e/happy/onboarding.yaml',
        'e2e/happy/vote.yaml',
        'e2e/happy/money.yaml',
      ],
      2,
    );
    expect(shards).toEqual([
      ['e2e/happy/fresh-join-under-way.yaml'],
      ['e2e/happy/onboarding.yaml', 'e2e/happy/vote.yaml', 'e2e/happy/money.yaml'],
    ]);
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
