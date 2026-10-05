/**
 * The fit route's answer for an organiser's own draft, read into the shape her Ideas rows show:
 * each fit is stamped with the draft it answers, and one the app can't read is left out.
 */
import { describe, expect, it } from '@jest/globals';

import { readDraftFits } from '../draft-fits';

const DRAFT = '0192f000-0000-7000-8000-000000000101';
const TEMPLE = '0192f000-0000-7000-8000-0000000000a1';
const NOW = new Date('2026-10-05T04:00:00Z');

describe('readDraftFits', () => {
  it('keys each fit by its place and stamps the draft it was worked out on', () => {
    const fits = readDraftFits(
      { fits: [{ poi_id: TEMPLE, best: null, days: [] }, { poi_id: 'not-an-id' }] },
      DRAFT,
      NOW,
    );
    expect([...fits.keys()]).toEqual([TEMPLE]);
    expect(fits.get(TEMPLE)).toMatchObject({
      version_id: DRAFT,
      computed_at: '2026-10-05T04:00:00.000Z',
      days: [],
    });
  });

  it('reads nothing from an answer that is not one', () => {
    expect(readDraftFits(null, DRAFT, NOW).size).toBe(0);
    expect(readDraftFits({ error: {} }, DRAFT, NOW).size).toBe(0);
  });
});
