/**
 * Every reason tag the guide may give a pick (the shared list the AI route's reply schema reads)
 * has its own card label, and only the place-only reason reads "Only here".
 */
import { PROPOSAL_REASON_TAGS } from '@cp/domain';
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { reasonLabel, reasonWhy } from '../data/picks';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('reason labels', () => {
  it('gives every shared reason tag its own label', () => {
    const labels = PROPOSAL_REASON_TAGS.map((tag) => reasonLabel(tag));
    expect(new Set(labels).size).toBe(PROPOSAL_REASON_TAGS.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });

  it('reads "Only here" for the place-only reason, and for a tag it does not know', () => {
    const onlyHere = reasonLabel('only_here');
    expect(onlyHere).toBe('Only here');
    expect(PROPOSAL_REASON_TAGS.filter((tag) => reasonLabel(tag) === onlyHere)).toEqual([
      'only_here',
    ]);
    expect(reasonLabel('a_new_tag')).toBe(onlyHere);
  });

  it('explains every shared reason tag', () => {
    const why = PROPOSAL_REASON_TAGS.map((tag) => reasonWhy(tag, 'Chà Vá'));
    expect(new Set(why).size).toBe(PROPOSAL_REASON_TAGS.length);
  });
});
