import { describe, expect, it } from 'vitest';

import {
  CliArgsError,
  mapRunResult,
  parseCliArgs,
  toAppRelativeFlows,
  type WorkflowRunResult,
} from './e2e-cloud.js';

describe('parseCliArgs', () => {
  it('accepts a platform with the default flows', () => {
    expect(parseCliArgs(['--platform', 'ios'])).toEqual({
      platform: 'ios',
      flows: 'e2e/smoke/app-launch.yaml',
    });
  });

  it('accepts an explicit flows override', () => {
    expect(parseCliArgs(['--platform', 'android', '--flows', 'e2e/crew'])).toEqual({
      platform: 'android',
      flows: 'e2e/crew',
    });
  });

  it('drops the literal `--` pnpm forwards ahead of the script args', () => {
    expect(parseCliArgs(['--', '--platform', 'ios'])).toEqual({
      platform: 'ios',
      flows: 'e2e/smoke/app-launch.yaml',
    });
  });

  it('rejects a missing --platform', () => {
    expect(() => parseCliArgs([])).toThrow(CliArgsError);
    expect(() => parseCliArgs([])).toThrow(/--platform is required/);
  });

  it('rejects an unknown platform', () => {
    expect(() => parseCliArgs(['--platform', 'web'])).toThrow(CliArgsError);
    expect(() => parseCliArgs(['--platform', 'web'])).toThrow(/must be one of ios, android/);
  });
});

describe('toAppRelativeFlows', () => {
  it('rewrites a repo-root-relative flow file to be relative to apps/mobile', () => {
    expect(toAppRelativeFlows('e2e/smoke/app-launch.yaml')).toBe('../../e2e/smoke/app-launch.yaml');
  });

  it('rewrites a repo-root-relative flow directory to be relative to apps/mobile', () => {
    expect(toAppRelativeFlows('e2e/crew')).toBe('../../e2e/crew');
  });
});

describe('mapRunResult', () => {
  it('maps a successful run to exit code 0 with the logs URL', () => {
    const run: WorkflowRunResult = {
      status: 'SUCCESS',
      logURL: 'https://expo.dev/accounts/critterpass/projects/critterpass/workflows/run-1',
    };
    const result = mapRunResult(run);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('succeeded');
    expect(result.message).toContain('run-1');
  });

  it('maps a failed run to a non-zero exit code naming the failing job and its errors', () => {
    const run: WorkflowRunResult = {
      status: 'FAILURE',
      logURL: 'https://expo.dev/accounts/critterpass/projects/critterpass/workflows/run-2',
      jobs: [
        { key: 'fingerprint', name: 'fingerprint', status: 'SUCCESS', errors: [] },
        { key: 'find_build', name: 'find_build', status: 'SUCCESS', errors: [] },
        {
          key: 'maestro_new_build',
          name: 'maestro_new_build',
          status: 'FAILURE',
          errors: [{ message: 'Flow "e2e/smoke/app-launch.yaml" failed: assertVisible timed out' }],
        },
      ],
    };
    const result = mapRunResult(run);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('maestro_new_build');
    expect(result.message).toContain('assertVisible timed out');
    expect(result.message).toContain('run-2');
  });

  it('falls back to a generic message when a failed run has no matching job entries', () => {
    const run: WorkflowRunResult = { status: 'CANCELED' };
    const result = mapRunResult(run);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('CANCELED');
    expect(result.message).not.toContain('Failing job');
  });

  it('treats a run with no recognizable status as non-success', () => {
    const result = mapRunResult({});
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('UNKNOWN');
  });
});
