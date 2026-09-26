import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEV_ROUTE_MARKER, findViolations } from './check-release-bundle.js';

describe('check-release-bundle findViolations', () => {
  let workDir: string;

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('passes a clean export with no dev-only trace', () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'cp-release-bundle-test-'));
    writeFileSync(path.join(workDir, 'index.js'), 'console.log("hello");');

    expect(findViolations(workDir, 'ios')).toEqual([]);
  });

  it('flags a bundle file that still contains the dev-route marker', () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'cp-release-bundle-test-'));
    writeFileSync(path.join(workDir, 'index.js'), `const marker = "${DEV_ROUTE_MARKER}";`);

    const violations = findViolations(workDir, 'ios');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(DEV_ROUTE_MARKER);
  });

  it('flags an exported path that still contains a (dev) segment', () => {
    workDir = mkdtempSync(path.join(tmpdir(), 'cp-release-bundle-test-'));
    mkdirSync(path.join(workDir, '(dev)'), { recursive: true });
    writeFileSync(path.join(workDir, '(dev)', '_probe.js'), 'console.log("probe");');

    const violations = findViolations(workDir, 'android');
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('(dev)');
  });
});
