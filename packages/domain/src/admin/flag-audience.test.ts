import { describe, expect, it } from 'vitest';

import { flagApplies, flagAudienceSchema } from './flag-audience';

const uid = '01920000-0000-7000-8000-000000000001';
const subject = { uid, cohorts: ['beta'], appVersion: '1.4.2' };

describe('flagApplies', () => {
  it('applies an all-audience flag to everyone', () => {
    expect(flagApplies({ kind: 'all' }, subject)).toBe(true);
  });

  it('matches cohorts and uid lists exactly', () => {
    expect(flagApplies({ kind: 'cohort', cohort: 'beta' }, subject)).toBe(true);
    expect(flagApplies({ kind: 'cohort', cohort: 'staff' }, subject)).toBe(false);
    expect(flagApplies({ kind: 'uids', uids: [uid] }, subject)).toBe(true);
    expect(
      flagApplies({ kind: 'uids', uids: ['01920000-0000-7000-8000-000000000002'] }, subject),
    ).toBe(false);
  });

  it('treats app-version bounds as inclusive and numeric', () => {
    expect(flagApplies({ kind: 'app_version', min: '1.4.2' }, subject)).toBe(true);
    expect(flagApplies({ kind: 'app_version', min: '1.10.0' }, subject)).toBe(false);
    expect(flagApplies({ kind: 'app_version', max: '1.4.1' }, subject)).toBe(false);
    expect(
      flagApplies({ kind: 'app_version', min: '1.0.0' }, { ...subject, appVersion: undefined }),
    ).toBe(false);
  });

  it('rejects a version range without bounds', () => {
    expect(flagAudienceSchema.safeParse({ kind: 'app_version' }).success).toBe(false);
  });
});
