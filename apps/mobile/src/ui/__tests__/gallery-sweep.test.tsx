import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { fixturesFor, listComponents } from '../gallery/registry';
import { STATE_GROUPS } from '../gallery/state-groups';
import { statesFlow, sweepFlow } from '../gallery/sweep-flows';
import { loadFixtureFiles } from '../test-support/load-fixtures';

loadFixtureFiles();

const E2E_GALLERY = path.resolve(__dirname, '../../../../../e2e/gallery');

/** Compares a generated flow with the committed file; `CP_WRITE_SWEEP=1` rewrites it instead. */
function expectFlow(file: string, generated: string): void {
  const target = path.join(E2E_GALLERY, file);
  if (process.env.CP_WRITE_SWEEP === '1') writeFileSync(target, generated);
  expect(readFileSync(target, 'utf8')).toBe(generated);
}

describe('gallery screenshot flows', () => {
  it('sweeps every registered component in every sweep locale', () => {
    expect(listComponents().length).toBeGreaterThan(100);
    expectFlow('sweep.yaml', sweepFlow(listComponents()));
  });

  it('builds every state group from fixtures that exist', () => {
    const missing = STATE_GROUPS.flatMap((group) => group.states)
      .flatMap((state) => state.fixtures)
      .filter((ref) => !fixturesFor(ref.component).some((it) => it.state === ref.state));
    expect(missing).toEqual([]);
    expect(STATE_GROUPS).toHaveLength(12);
    expectFlow('states.yaml', statesFlow(STATE_GROUPS));
  });
});
