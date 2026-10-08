import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  attemptResult,
  DEFAULT_FLOW_TIMEOUT_MINUTES,
  flowOutcome,
  flowTimeoutMinutes,
  keepFirstFailure,
  markPassedOnRetry,
  reportedOutcome,
  shouldRetry,
  timedOutJunit,
} from './flow-attempts';

const passedXml =
  '<?xml version="1.0"?>\n<testsuites>\n<testsuite name="Test Suite" tests="1" failures="0" time="126.0">\n<testcase id="money" name="money" time="126.0" status="SUCCESS"/>\n</testsuite>\n</testsuites>';
const failedXml =
  '<testsuites><testsuite tests="1" failures="1"><testcase id="money" time="40" status="ERROR"><failure>Element not found: Id matching regex: money-add &amp; more</failure></testcase></testsuite></testsuites>';

describe('retry decision', () => {
  it('runs a failed flow once more, and only once', () => {
    expect(shouldRetry(['failed'])).toBe(true);
    expect(shouldRetry(['failed', 'failed'])).toBe(false);
    expect(shouldRetry(['passed'])).toBe(false);
  });

  it('does not run a flow again after it was stopped at the time limit', () => {
    expect(shouldRetry(['timed out'])).toBe(false);
  });

  it('never reports a pass on the second run as a plain pass', () => {
    expect(flowOutcome(['passed'])).toBe('passed');
    expect(flowOutcome(['failed', 'passed'])).toBe('passed on retry');
    expect(flowOutcome(['failed', 'failed'])).toBe('failed');
    expect(flowOutcome(['failed', 'timed out'])).toBe('timed out');
    expect(flowOutcome(['timed out'])).toBe('timed out');
  });
});

describe('time limit', () => {
  it('reads a process stopped at the limit as timed out, not failed', () => {
    const stopped = Object.assign(new Error('spawnSync maestro ETIMEDOUT'), { code: 'ETIMEDOUT' });
    expect(attemptResult({ status: null, error: stopped })).toBe('timed out');
    expect(attemptResult({ status: 1 })).toBe('failed');
    expect(attemptResult({ status: null })).toBe('failed');
    expect(attemptResult({ status: 0 })).toBe('passed');
  });

  it('uses the default unless the dispatch names minutes', () => {
    expect(flowTimeoutMinutes(undefined)).toBe(DEFAULT_FLOW_TIMEOUT_MINUTES);
    expect(flowTimeoutMinutes(' ')).toBe(DEFAULT_FLOW_TIMEOUT_MINUTES);
    expect(flowTimeoutMinutes('12.5')).toBe(12.5);
    expect(() => flowTimeoutMinutes('0')).toThrow(/minutes/);
    expect(() => flowTimeoutMinutes('soon')).toThrow(/minutes/);
  });
});

describe('JUnit reports', () => {
  it('writes a failed report for a flow stopped at the limit', () => {
    const report = reportedOutcome(timedOutJunit('e2e__happy__money', 5400, 90));
    expect(report.outcome).toBe('timed out');
    expect(report.failure).toContain('90 minutes');
  });

  it('carries "passed on retry" and the first failure in the passing report', () => {
    const first = reportedOutcome(failedXml);
    expect(first).toEqual({
      outcome: 'failed',
      failure: 'Element not found: Id matching regex: money-add & more',
    });
    const marked = markPassedOnRetry(passedXml, first.failure ?? '');
    expect(marked).toContain('status="SUCCESS"');
    expect(reportedOutcome(marked)).toEqual({ outcome: 'passed on retry', failure: first.failure });
    expect(reportedOutcome(passedXml)).toEqual({ outcome: 'passed' });
  });
});

describe('keepFirstFailure', () => {
  it("moves the first run's files aside and leaves other flows alone", () => {
    const out = mkdtempSync(path.join(tmpdir(), 'cp-attempts-'));
    const files = [
      'junit/e2e__happy__money.xml',
      'maestro/e2e__happy__money/maestro.log',
      'failures/e2e__happy__money.png',
      'failures/e2e__happy__money.logcat.txt',
      'failures/e2e__happy__money-vnd.png',
      'junit/e2e__happy__vote.xml',
    ];
    for (const file of files) {
      mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
      writeFileSync(path.join(out, file), file);
    }
    keepFirstFailure(out, 'e2e__happy__money');
    const kept = files.filter((file) => existsSync(path.join(out, 'first-failure', file)));
    expect(kept).toEqual(files.slice(0, 4));
    expect(files.filter((file) => existsSync(path.join(out, file)))).toEqual(files.slice(4));
    expect(
      readFileSync(path.join(out, 'first-failure/maestro/e2e__happy__money/maestro.log'), 'utf8'),
    ).toBe('maestro/e2e__happy__money/maestro.log');
  });
});
