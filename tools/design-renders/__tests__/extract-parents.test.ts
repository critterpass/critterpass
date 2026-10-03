import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  OUTPUT,
  generate,
  legacyParents,
  parseCommitted,
  parseStateGroups,
  resolveIds,
} from '../extract-parents';

const LABELS = [
  '3i-3 Scan a receipt',
  "3i-4 Couldn't read it",
  '6c-3 Couldn’t read it',
  '6c-1 Add',
];

describe('resolveIds', () => {
  it('settles a name two screens share by the section of its STATES group', () => {
    const groups = parseStateGroups(
      `STATES = [['Add', 'Other'], ['Scan a receipt', "Couldn't read it"]];`,
    );
    const ids = resolveIds(LABELS, ['Scan a receipt', "Couldn't read it"], groups);
    expect(ids.get("Couldn't read it")).toBe('3i-4');
  });

  it('fails on a shared name no STATES group settles', () => {
    expect(() => resolveIds(LABELS, ["Couldn't read it"], [])).toThrow(/matches 2 screens/);
  });

  it('fails on a name no screen has', () => {
    expect(() => resolveIds(LABELS, ['Trip plan'], [])).toThrow(/matches 0 screens/);
  });
});

describe('legacyParents', () => {
  it('keeps dropped screens the app still registers, and only those', () => {
    const committed = new Map([
      ['3e-1', '3k-1'],
      ['3e-2', '3e-1'],
      ['3z-1', '3b-1'],
      ['3i-4', '3i-3'],
    ]);
    const legacy = legacyParents(committed, LABELS, new Set(['3e-1', '3e-2', '3i-4']));
    expect(legacy).toEqual([
      ['3e-1', '3k-1'],
      ['3e-2', '3e-1'],
    ]);
  });
});

describe('parents.ts', { timeout: 60_000 }, () => {
  const committed = readFileSync(OUTPUT, 'utf8');

  it('is what the current design generates', async () => {
    expect(await generate(committed)).toBe(committed);
  });

  it('is reported stale when an entry is edited by hand', async () => {
    const stale = committed.replace("'7f-1': '7e-1'", "'7f-1': '7c-1'");
    expect(stale).not.toBe(committed);
    expect(await generate(stale)).not.toBe(stale);
  });

  it('sends the new screens back where the prototype says and keeps the legacy ones', () => {
    const parents = parseCommitted(committed);
    expect(parents.get('7f-1')).toBe('7e-1');
    expect(parents.get('3o-1')).toBe('7g-3');
    expect(parents.get('3e-2')).toBe('3e-1');
    expect(parents.get('3d-3')).toBe('3d-1');
    expect(committed).toMatch(/\.\.\.LEGACY_PARENTS,\n};/);
  });
});
