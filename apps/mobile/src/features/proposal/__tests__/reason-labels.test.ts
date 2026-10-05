/**
 * Every reason tag the guide may give a pick (the shared list the AI route's reply schema reads)
 * has its own card label, and only the place-only reason reads "Only here".
 */
import { PROPOSAL_REASON_TAGS } from '@cp/domain';
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { cardLabel, pickTag, reasonLabel, reasonWhy } from '../data/picks';
import type { PickReason } from '../data/reasons';

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

  it('shows the guide’s own short label, and the tag’s label when it wrote none or too long', () => {
    expect(cardLabel(' BẠN MÊ ĐỒ ĂN VỈA HÈ ')).toBe('BẠN MÊ ĐỒ ĂN VỈA HÈ');
    expect(cardLabel(undefined)).toBeNull();
    expect(cardLabel('   ')).toBeNull();
    expect(cardLabel('A LABEL FAR TOO LONG FOR A CARD')).toBeNull();
  });

  const pick = (over: Partial<PickReason>): PickReason => ({
    reasonTag: 'matches_taste',
    reasonLabel: 'SUNRISE, YOUR WAY',
    dayNo: 1,
    ...over,
  });
  const minh = { uid: 'u-minh', hasWishes: false, guideName: 'Chà Vá' };
  const linh = { uid: 'u-linh', hasWishes: true, guideName: 'Chà Vá' };

  it('never tells a reader with no wishes on record that they picked something', () => {
    const plain = reasonWhy(pick({}), minh);
    expect(plain).toBe(reasonWhy(pick({ reasonTag: 'crew_favourite' }), minh));
    expect(plain).not.toBe(reasonWhy(pick({}), linh));
    // The guide's own tag is a claim about the reader: without wishes the card names the day.
    expect(pickTag(pick({}), minh)).toBe(reasonLabel('group_day', 1));
    expect(pickTag(pick({}), linh)).toBe('SUNRISE, YOUR WAY');
    expect(pickTag(pick({ reasonTag: 'your_must_do', reasonLabel: null }), linh)).toBe(
      reasonLabel('group_day', 1),
    );
  });

  it('names what is known: whose must-do the stop is', () => {
    const hers = pick({ mustDoOwnerId: 'u-linh', mustDoOwnerName: 'Linh' });
    expect(pickTag(hers, linh)).toBe(reasonLabel('your_must_do'));
    expect(pickTag(hers, minh)).toBe(reasonLabel('group_must_do'));
    expect(reasonWhy(hers, minh)).toContain('Linh');
    expect(reasonWhy(hers, linh)).not.toContain('Linh');
  });
});
