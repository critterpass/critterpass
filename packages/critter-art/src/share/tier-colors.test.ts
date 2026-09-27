import { tokens } from '@cp/design-tokens';
import { describe, expect, it } from 'vitest';

import { TIER_COLORS } from '../forms/tier-palette';

// Guards against the renderer's own tier constants (docs/design-system.md §1.2) drifting from the
// generated design tokens, which share cards read directly for text/background colour. `lockedMask`
// is asserted for every tier (design-tokens' single "silhouette" colour per tier); `lockedSticker`
// only has a design-tokens counterpart for legendary — common/rare/epic's darker sticker-outline
// shade is a critter-art-only refinement with no separate token (documented, not a discrepancy).
describe('TIER_COLORS matches @cp/design-tokens', () => {
  it('accent colours match tokens.tier.<rarity>.color', () => {
    expect(TIER_COLORS.common.accent).toBe(tokens.tier.common.color);
    expect(TIER_COLORS.rare.accent).toBe(tokens.tier.rare.color);
    expect(TIER_COLORS.epic.accent).toBe(tokens.tier.epic.color);
    expect(TIER_COLORS.legendary.accent).toBe(tokens.tier.legendary.color);
  });

  it('common/rare/epic lockedMask matches the shared tokens.tier.locked.default silhouette', () => {
    expect(TIER_COLORS.common.lockedMask).toBe(tokens.tier.locked.default);
    expect(TIER_COLORS.rare.lockedMask).toBe(tokens.tier.locked.default);
    expect(TIER_COLORS.epic.lockedMask).toBe(tokens.tier.locked.default);
  });

  it('legendary lockedMask/lockedSticker match tokens.tier.locked.legendary silhouette/background', () => {
    expect(TIER_COLORS.legendary.lockedMask).toBe(tokens.tier.locked.legendary.silhouette);
    expect(TIER_COLORS.legendary.lockedSticker).toBe(tokens.tier.locked.legendary.background);
  });
});
