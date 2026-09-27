import { describe, expect, it } from 'vitest';

import { canRunAdminCommand } from './policy';
import { isEstimatedSeasonSource } from './season-review';

describe('season review', () => {
  it('marks months whose cited source says the value was interpolated or estimated', () => {
    expect(
      isEstimatedSeasonSource('INE Portugal — Lisbon dormidas interpolated between releases'),
    ).toBe(true);
    expect(isEstimatedSeasonSource('Kyoto survey (other months estimated within range)')).toBe(
      true,
    );
    expect(isEstimatedSeasonSource('BPS Bali Province, Maret 2025')).toBe(false);
  });

  it('lets the content role run both season review commands', () => {
    expect(canRunAdminCommand(['content'], 'upsert_season_editorial').ok).toBe(true);
    expect(canRunAdminCommand(['content'], 'review_season_event').ok).toBe(true);
    expect(canRunAdminCommand(['support'], 'review_season_event').ok).toBe(false);
  });
});
