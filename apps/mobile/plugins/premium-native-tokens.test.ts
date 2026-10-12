/**
 * The native surfaces draw with the same premium tokens as the app: each committed copy matches
 * what packages/design-tokens emits today (rewrite with `tsx plugins/premium-native-tokens.ts
 * --write`).
 */
import { describe, expect, it } from '@jest/globals';

import { premiumTokenCopies, readCopy } from './premium-native-tokens';

describe('premium native tokens', () => {
  it.each(premiumTokenCopies().map((copy) => [copy.path, copy] as const))(
    '%s matches the design tokens',
    (_path, copy) => {
      expect(readCopy(copy) === copy.source).toBe(true);
    },
  );
});
