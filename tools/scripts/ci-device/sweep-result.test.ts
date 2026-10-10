import { describe, expect, it } from 'vitest';

import type { SweepFlow } from './sweep-manifest';
import {
  formatSweepResult,
  shardFailures,
  sweepResult,
  sweepVerdict,
  type SweepShard,
} from './sweep-result';

const shots = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `en-${prefix}-${String(index + 1)}`);

const FLOWS: SweepFlow[] = [
  {
    flow: 'e2e/sweep/lab-guide-en',
    kind: 'lab',
    name: 'guide',
    lang: 'en',
    shots: shots('lab', 30),
  },
  {
    flow: 'e2e/sweep/seed-vote-en',
    kind: 'seed',
    name: 'vote',
    lang: 'en',
    shots: shots('seed', 10),
  },
];

function shard(over: Partial<SweepShard> = {}): SweepShard {
  return {
    shard: 'android-shard-1',
    planned: ['e2e/sweep/lab-guide-en', 'e2e/sweep/seed-vote-en'],
    failedFlows: [],
    screenshots: [...shots('lab', 30), ...shots('seed', 10)],
    failures: [],
    ...over,
  };
}

const CLEAN = { screenChecks: 0, uiQa: 0 };

describe('the sweep failure rule', () => {
  it('is green when every planned screenshot was captured', () => {
    const result = sweepResult([shard()], FLOWS);
    expect(result).toEqual({ planned: 40, missing: [], labsNotOpened: [] });
    expect(sweepVerdict(result ?? fail(), CLEAN)).toEqual([]);
  });

  it('reports one missing screenshot with its failure screen, and stays green', () => {
    const result = sweepResult(
      [
        shard({
          screenshots: [...shots('lab', 29), ...shots('seed', 10)],
          failures: ['not-captured-en-lab-30.png'],
        }),
      ],
      FLOWS,
    );
    expect(result?.missing).toEqual([
      {
        shot: 'en-lab-30',
        flow: 'e2e/sweep/lab-guide-en',
        shard: 'android-shard-1',
        failureScreen: 'failures/not-captured-en-lab-30.png',
      },
    ]);
    const reasons = sweepVerdict(result ?? fail(), CLEAN);
    expect(reasons).toEqual([]);
    const text = formatSweepResult(result ?? fail(), reasons);
    expect(text).toContain('**Green.**');
    expect(text).toContain('Screenshots captured: **39 of 40** (2.5% not captured');
    expect(text).toContain(
      '- `en-lab-30` (lab-guide-en, android-shard-1): `failures/not-captured-en-lab-30.png`',
    );
  });

  it('stays green at exactly the limit and turns red above it', () => {
    const at = sweepResult(
      [shard({ screenshots: [...shots('lab', 28), ...shots('seed', 10)] })],
      FLOWS,
    );
    expect(sweepVerdict(at ?? fail(), CLEAN)).toEqual([]);
    const over = sweepResult(
      [shard({ screenshots: [...shots('lab', 27), ...shots('seed', 10)] })],
      FLOWS,
    );
    expect(sweepVerdict(over ?? fail(), CLEAN)).toEqual([
      '3 of 40 screenshots not captured (more than 5%)',
    ]);
  });

  it('counts a failed seed flow as its missing screenshots, with the flow’s failure screen', () => {
    const result = sweepResult(
      [
        shard({
          failedFlows: ['e2e/sweep/seed-vote-en'],
          screenshots: [...shots('lab', 30), ...shots('seed', 9)],
          failures: ['e2e__sweep__seed-vote-en.png'],
        }),
      ],
      FLOWS,
    );
    expect(result?.labsNotOpened).toEqual([]);
    expect(result?.missing).toEqual([
      {
        shot: 'en-seed-10',
        flow: 'e2e/sweep/seed-vote-en',
        shard: 'android-shard-1',
        failureScreen: 'failures/e2e__sweep__seed-vote-en.png',
      },
    ]);
    expect(sweepVerdict(result ?? fail(), CLEAN)).toEqual([]);
  });

  it('is red when a lab did not open, on a screen-check finding and on a [ui-qa] line', () => {
    const result = sweepResult([shard({ failedFlows: ['e2e/sweep/lab-guide-en'] })], FLOWS);
    expect(result?.labsNotOpened).toEqual(['e2e/sweep/lab-guide-en (android-shard-1)']);
    expect(sweepVerdict(result ?? fail(), { screenChecks: 2, uiQa: 1 })).toEqual([
      '2 screen-check finding(s)',
      '1 [ui-qa] line(s)',
      '1 lab(s) did not open',
    ]);
  });

  it('counts a shard that uploaded nothing as all its screenshots missing', () => {
    const result = sweepResult([shard({ screenshots: [] })], FLOWS);
    expect(result?.missing).toHaveLength(40);
    expect(sweepVerdict(result ?? fail(), CLEAN)).toHaveLength(1);
  });

  it('counts a screenshot captured on another shard of the same platform', () => {
    const result = sweepResult(
      [
        shard({ planned: ['e2e/sweep/seed-vote-en'], screenshots: [] }),
        shard({ shard: 'android-shard-2', planned: [], screenshots: shots('seed', 10) }),
        shard({ shard: 'ios-shard-1', planned: ['e2e/sweep/seed-vote-en'], screenshots: [] }),
      ],
      FLOWS,
    );
    expect(result?.planned).toBe(20);
    expect(result?.missing.map((miss) => miss.shard)).toEqual(Array(10).fill('ios-shard-1'));
  });

  it('has nothing to say about a run with no sweep flow', () => {
    expect(sweepResult([shard({ planned: ['e2e/happy/money'] })], FLOWS)).toBeUndefined();
  });

  it('lets a failed seed flow pass its shard, and nothing else', () => {
    expect(
      shardFailures([
        'e2e/sweep/seed-vote-en.yaml',
        'e2e/sweep/lab-guide-en.yaml',
        'e2e/happy/money.yaml',
      ]),
    ).toEqual({
      red: ['e2e/sweep/lab-guide-en.yaml', 'e2e/happy/money.yaml'],
      tolerated: ['e2e/sweep/seed-vote-en.yaml'],
    });
  });
});

function fail(): never {
  throw new Error('the run planned sweep flows');
}
