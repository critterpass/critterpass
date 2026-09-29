import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatSummary, readShards } from './run-summary';

function shard(root: string, name: string, files: Record<string, string>): void {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name, file)), { recursive: true });
    writeFileSync(path.join(root, name, file), text);
  }
}

describe('run summary', () => {
  it('lists failed flows, screen-check findings and ui-qa reports from every shard', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'run-summary-'));
    shard(root, 'device-ios-shard-1', {
      'junit/e2e__screens__sweep__vote-en.xml':
        '<testsuite><testcase><failure/></testcase></testsuite>',
      'junit/e2e__screens__sweep__inbox-en.xml': '<testsuite><testcase/></testsuite>',
      'screen-checks.log': 'en-3c-1-showdown: EMPTY_SCREEN only 18% of rows\n',
      'ui-qa.log': '',
    });
    shard(root, 'device-ios-shard-2', {
      'ui-qa.log': 'e2e/x.yaml:\n  [ui-qa] HEADER_OVERLAP "inbox"\n',
    });
    const shards = readShards(root);
    expect(shards[0]?.failedFlows).toEqual(['e2e/screens/sweep/vote-en']);
    const text = formatSummary(shards);
    expect(text).toContain('Flows failed: **1**');
    expect(text).toContain('`e2e/screens/sweep/vote-en (ios-shard-1)`');
    expect(text).toContain('en-3c-1-showdown: EMPTY_SCREEN');
    expect(text).toContain('[ui-qa] HEADER_OVERLAP');
  });

  it('says so when a run is clean', () => {
    expect(formatSummary([])).toContain('Every flow passed');
  });
});
