import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  parseCaptureArgs,
  parseEasJson,
  pickIosRuntime,
  planCopies,
  resolveFlowFiles,
  screenshotNames,
} from './capture-app-screens';
import { CliArgsError } from './e2e-cloud';

const REPO = path.resolve(import.meta.dirname, '../..');

describe('parseCaptureArgs', () => {
  it('resolves flows and out against the invocation directory', () => {
    expect(
      parseCaptureArgs(['--flows', 'e2e/screens/home.yaml', '--out', 'shots'], '/repo'),
    ).toEqual({
      flows: ['/repo/e2e/screens/home.yaml'],
      out: '/repo/shots',
      dark: false,
      device: 'iPhone 17',
    });
  });

  it('takes shell-expanded globs after --flows as extra flows, and drops the pnpm `--`', () => {
    const options = parseCaptureArgs(
      [
        '--',
        '--flows',
        'e2e/screens/home.yaml',
        'e2e/screens/motion-lab.yaml',
        '--out',
        '/tmp/o',
        '--dark',
      ],
      '/repo',
    );
    expect(options.flows).toEqual([
      '/repo/e2e/screens/home.yaml',
      '/repo/e2e/screens/motion-lab.yaml',
    ]);
    expect(options.out).toBe('/tmp/o');
    expect(options.dark).toBe(true);
  });

  it('accepts a repeated --flows and a --device override', () => {
    const options = parseCaptureArgs(
      ['--flows', 'a.yaml', '--flows', 'b.yaml', '--out', 'o', '--device', 'iPhone 16'],
      '/r',
    );
    expect(options.flows).toEqual(['/r/a.yaml', '/r/b.yaml']);
    expect(options.device).toBe('iPhone 16');
  });

  it('requires --flows and --out', () => {
    expect(() => parseCaptureArgs(['--out', 'o'], '/r')).toThrow(CliArgsError);
    expect(() => parseCaptureArgs(['--out', 'o'], '/r')).toThrow(/--flows is required/);
    expect(() => parseCaptureArgs(['--flows', 'a.yaml'], '/r')).toThrow(/--out is required/);
  });
});

describe('resolveFlowFiles', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'cp-flows-'));
    mkdirSync(path.join(dir, 'screens'));
    for (const name of ['b.yaml', 'a.yaml', 'notes.md'])
      writeFileSync(path.join(dir, 'screens', name), '');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('expands a directory into its sorted yaml flows and keeps explicit order without duplicates', () => {
    const screens = path.join(dir, 'screens');
    expect(resolveFlowFiles([path.join(screens, 'b.yaml'), screens])).toEqual([
      path.join(screens, 'b.yaml'),
      path.join(screens, 'a.yaml'),
    ]);
  });

  it('rejects missing paths and non-yaml files', () => {
    expect(() => resolveFlowFiles([path.join(dir, 'missing.yaml')])).toThrow(/Flow not found/);
    expect(() => resolveFlowFiles([path.join(dir, 'screens', 'notes.md')])).toThrow(
      /Not a Maestro flow/,
    );
  });

  it('rejects a directory with no flows', () => {
    mkdirSync(path.join(dir, 'empty'));
    expect(() => resolveFlowFiles([path.join(dir, 'empty')])).toThrow(/No Maestro flows/);
  });
});

describe('screenshotNames', () => {
  it('reads inline and path forms, stripping quotes, comments and .png', () => {
    const yaml = [
      '- launchApp',
      '- takeScreenshot: home',
      "- takeScreenshot: 'dev-tools.png' # list",
      '- takeScreenshot:',
      '    path: settled',
    ].join('\n');
    expect(screenshotNames(yaml)).toEqual(['home', 'dev-tools', 'settled']);
  });

  it('finds every screenshot in the committed screen flows', () => {
    const read = (name: string) => readFileSync(path.join(REPO, 'e2e/screens', name), 'utf8');
    expect(screenshotNames(read('home.yaml'))).toEqual(['home', 'dev-tools']);
    expect(screenshotNames(read('motion-lab.yaml'))).toEqual(['motion-lab']);
  });
});

describe('planCopies', () => {
  it('copies each screenshot by name and prefixes names shared by several flows', () => {
    const plan = planCopies(
      [
        { flow: '/e2e/home.yaml', dir: '/w/flow-0', names: ['home', 'settled'] },
        { flow: '/e2e/motion-lab.yaml', dir: '/w/flow-1', names: ['settled'] },
      ],
      '/out',
    );
    expect(plan).toEqual([
      { from: '/w/flow-0/home.png', to: '/out/home.png' },
      { from: '/w/flow-0/settled.png', to: '/out/home-settled.png' },
      { from: '/w/flow-1/settled.png', to: '/out/motion-lab-settled.png' },
    ]);
  });
});

describe('pickIosRuntime', () => {
  it('picks the newest available iOS runtime', () => {
    const runtime = pickIosRuntime([
      { identifier: 'ios-26-3', version: '26.3.1', platform: 'iOS', isAvailable: true },
      { identifier: 'ios-27-0', version: '27.0', platform: 'iOS', isAvailable: true },
      { identifier: 'ios-28-0', version: '28.0', platform: 'iOS', isAvailable: false },
      { identifier: 'watch-12', version: '30.0', platform: 'watchOS', isAvailable: true },
      { identifier: 'ios-26-10', version: '26.10', platform: 'iOS', isAvailable: true },
    ]);
    expect(runtime?.identifier).toBe('ios-27-0');
  });

  it('returns undefined when no iOS runtime is installed', () => {
    expect(pickIosRuntime([])).toBeUndefined();
  });
});

describe('parseEasJson', () => {
  it('skips plain-text notices that eas-cli prints before its JSON', () => {
    const stdout =
      'Environment variables loaded from the "development" environment on EAS: X.\n\n{\n  "hash": "abc"\n}\n';
    expect(parseEasJson(stdout)).toEqual({ hash: 'abc' });
    expect(parseEasJson('[]')).toEqual([]);
  });

  it('fails clearly when there is no JSON', () => {
    expect(() => parseEasJson('Not logged in')).toThrow(/no JSON output/);
  });
});
