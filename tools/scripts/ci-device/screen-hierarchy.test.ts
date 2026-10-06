import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { hierarchyJson, saveHierarchy } from './screen-hierarchy';

afterEach(() => vi.unstubAllEnvs());

describe('screen hierarchy', () => {
  it('takes the hierarchy document out of output that starts with notices', () => {
    const document = '{"attributes":{"clickable":"true"},"children":[]}';
    expect(hierarchyJson(`Running on emulator-5554\n\n${document}\n`)).toBe(document);
    expect(hierarchyJson(document)).toBe(document);
  });

  it('gives nothing for output without a whole document', () => {
    expect(hierarchyJson('')).toBeNull();
    expect(hierarchyJson('Unable to launch driver')).toBeNull();
    expect(hierarchyJson('{"attributes":{"clickable"')).toBeNull();
  });

  it('is off unless asked for, and a Maestro that cannot run leaves the shard alone', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'hierarchy-')), 'h', 'flow.json');
    saveHierarchy('/no/such/maestro', 'emulator-5554', file);
    vi.stubEnv('SAVE_HIERARCHY', 'true');
    expect(() => saveHierarchy('/no/such/maestro', 'emulator-5554', file)).not.toThrow();
    expect(existsSync(file)).toBe(false);
  });
});
