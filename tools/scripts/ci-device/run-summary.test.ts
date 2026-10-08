import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { markPassedOnRetry, timedOutJunit } from './flow-attempts';
import { formatSummary, readShards, shardPlan } from './run-summary';

function shard(root: string, name: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name, file)), { recursive: true });
    writeFileSync(path.join(root, name, file), text);
  }
}

const passed = '<testsuite><testcase/></testsuite>';
const failed = '<testsuite><testcase><failure/></testcase></testsuite>';
const matrix = (...shards: string[]) =>
  JSON.stringify({ include: shards.map((flows, index) => ({ shard: index + 1, flows })) });

describe('run summary', () => {
  it('lists failed flows, screen-check findings and ui-qa reports from every shard', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-summary-'));
    shard(root, 'device-ios-shard-1', {
      'junit/e2e__screens__sweep__vote-en.xml': failed,
      'junit/e2e__screens__sweep__inbox-en.xml': passed,
      'screen-checks.log': 'en-3c-1-showdown: EMPTY_SCREEN only 18% of rows\n',
      'ui-qa.log': '',
    });
    shard(root, 'device-ios-shard-2', {
      'junit/e2e__screens__sweep__home-en.xml': passed,
      'ui-qa.log': 'e2e/x.yaml:\n  [ui-qa] HEADER_OVERLAP "inbox"\n',
    });
    const shards = readShards(root);
    expect(shards[0]?.failedFlows).toEqual(['e2e/screens/sweep/vote-en']);
    const text = formatSummary(shards);
    expect(text).toContain('Flows failed: **1**');
    expect(text).toContain('`e2e/screens/sweep/vote-en (ios-shard-1)`');
    expect(text).toContain('en-3c-1-showdown: EMPTY_SCREEN');
    expect(text).toContain('[ui-qa] HEADER_OVERLAP');
    expect(text).not.toContain('no result');
  });

  it('keeps a flow that passed on retry visible, and marks one stopped at the time limit', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-summary-'));
    shard(root, 'device-android-shard-1', {
      'junit/e2e__happy__vote.xml': passed,
      'junit/e2e__happy__money.xml': markPassedOnRetry(passed, 'Element not found: money-add'),
    });
    const flaky = formatSummary(readShards(root));
    expect(flaky).not.toContain('Every flow passed');
    expect(flaky).toContain('Flows failed: **0**');
    expect(flaky).toContain('Flows passed on retry (the first run failed): **1**');
    expect(flaky).toContain('`e2e/happy/money (android-shard-1)`');

    shard(root, 'device-android-shard-2', {
      'junit/e2e__happy__chat.xml': timedOutJunit('e2e__happy__chat', 5400, 90),
    });
    expect(formatSummary(readShards(root))).toContain(
      '`e2e/happy/chat (android-shard-2, timed out)`',
    );
  });

  it('says so when every planned flow ran and passed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-summary-'));
    shard(root, 'device-android-shard-1', {
      'junit/tools__scripts__ci-device__js-commit.xml': passed,
      'junit/e2e__home__first-run.xml': passed,
    });
    const plan = shardPlan({ android: matrix('e2e/home/first-run.yaml'), ios: '' });
    expect(formatSummary(readShards(root, plan))).toContain('Every flow passed');
  });

  it('never calls a run clean when its only shard stopped before any flow', () => {
    // The emulator failed to install: the shard uploaded no artifact at all.
    const root = mkdtempSync(path.join(tmpdir(), 'run-summary-'));
    const plan = shardPlan({ android: matrix('e2e/happy/fresh-join-under-way.yaml') });
    for (const text of [formatSummary(readShards(root, plan)), formatSummary(readShards(root))]) {
      expect(text).toContain('**No flow ran.**');
      expect(text).not.toContain('Every flow passed');
    }
    expect(formatSummary(readShards(root, plan))).toContain(
      '`e2e/happy/fresh-join-under-way (android-shard-1)`',
    );
  });

  it('lists the flows of a shard that stopped while the other shards passed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-summary-'));
    shard(root, 'device-android-shard-1', { 'junit/e2e__chat__send.xml': passed });
    // Shard 2 reached its first flow only; shard 3 uploaded nothing.
    shard(root, 'device-android-shard-2', { 'junit/e2e__home__inbox.xml': passed });
    const plan = shardPlan({
      android: matrix(
        'e2e/chat/send.yaml',
        'e2e/home/inbox.yaml e2e/home/undo.yaml',
        'e2e/money/settle.yaml',
      ),
    });
    const shards = readShards(root, plan);
    expect(shards.map((s) => [s.shard, s.ran, s.notRun])).toEqual([
      ['android-shard-1', 1, []],
      ['android-shard-2', 1, ['e2e/home/undo']],
      ['android-shard-3', 0, ['e2e/money/settle']],
    ]);
    const text = formatSummary(shards);
    expect(text).not.toContain('Every flow passed');
    expect(text).toContain('Flows with no result (their shard stopped first): **2**');
    expect(text).toContain('`e2e/home/undo (android-shard-2)`');
    expect(text).toContain('`e2e/money/settle (android-shard-3)`');
  });

  it('reports an uploaded shard with no report even without a plan', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-summary-'));
    shard(root, 'device-ios-shard-1', { 'junit/e2e__chat__send.xml': passed });
    shard(root, 'device-ios-shard-2', { 'failures/launch.log.txt': 'crashed on launch' });
    const text = formatSummary(readShards(root));
    expect(text).not.toContain('Every flow passed');
    expect(text).toContain('`every flow of ios-shard-2`');
  });
});
