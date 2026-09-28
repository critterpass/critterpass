// Fixture modules import Skia and expo-router, whose native halves do not exist under Jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

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
