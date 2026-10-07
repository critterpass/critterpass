/**
 * The resume date across a sync with the store. Play reports its own pause and the row follows
 * it; the App Store reports none, so the date a member planned stays until they turn renewal back
 * on.
 */
import { describe, expect, it } from 'vitest';

import { resumeAtAfterSync } from '../../src/billing/pause-intent';

const PLANNED = new Date('2027-03-01T00:00:00Z');
const appStore = {
  platform: 'app_store',
  status: 'active',
  autoRenew: false,
  resumeAt: null,
} as const;

describe('the resume date after a sync with the store', () => {
  it("keeps a member's planned date through an App Store sync that reports none", () => {
    expect(resumeAtAfterSync({ autoRenew: true, resumeAt: PLANNED }, appStore)).toBe(PLANNED);
    expect(resumeAtAfterSync({ autoRenew: false, resumeAt: PLANNED }, appStore)).toBe(PLANNED);
    expect(
      resumeAtAfterSync(
        { autoRenew: false, resumeAt: PLANNED },
        { ...appStore, status: 'expired' },
      ),
    ).toBe(PLANNED);
  });

  it('keeps it while renewal was never turned off', () => {
    expect(
      resumeAtAfterSync({ autoRenew: true, resumeAt: PLANNED }, { ...appStore, autoRenew: true }),
    ).toBe(PLANNED);
  });

  it('drops it once renewal is turned back on', () => {
    expect(
      resumeAtAfterSync({ autoRenew: false, resumeAt: PLANNED }, { ...appStore, autoRenew: true }),
    ).toBeNull();
  });

  it("follows Play's own resume date, and clears it when Play reports none", () => {
    const stores = new Date('2026-12-01T00:00:00Z');
    const play = { platform: 'play', status: 'paused', autoRenew: true, resumeAt: stores } as const;
    expect(resumeAtAfterSync({ autoRenew: true, resumeAt: PLANNED }, play)).toBe(stores);
    expect(
      resumeAtAfterSync(
        { autoRenew: true, resumeAt: stores },
        { ...play, status: 'active', resumeAt: null },
      ),
    ).toBeNull();
  });

  it('has nothing to keep on a first sync', () => {
    expect(resumeAtAfterSync(undefined, appStore)).toBeNull();
  });
});
