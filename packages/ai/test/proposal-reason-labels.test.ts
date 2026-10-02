/**
 * A pick's own card label ("YOU PICKED STREET FOOD") is kept when it is one short line with no
 * number and nobody else's name, and dropped otherwise, so the app shows the reason tag's label
 * instead; a bad label never costs the member their version.
 */
import { describe, expect, it } from 'vitest';

import { keepGoodLabels, REASON_LABEL_MAX, type VersionContext, type VersionReply } from '../src';

const ITEM = '0199a0f2-0000-7000-8000-00000000d001';

const context: VersionContext = {
  guide: 'chava',
  recipientFirstName: 'Linh',
  destination: 'Da Nang',
  dates: '2026-10-02 to 2026-10-04',
  tasteTags: ['street_food'],
  items: [{ id: ITEM, title: 'Mì Quảng Bà Mua', day: 1, category: 'food', must_do: true }],
  share: null,
  savings: [],
  otherNames: ['Minh'],
};

const withLabel = (label: string | undefined): VersionReply => ({
  slides: [{ headline: 'Mì Quảng first', body: 'Start here.', item_id: ITEM }],
  poster: { title: 'Da Nang' },
  postcard: { message: 'Are you in?' },
  highlights: [
    {
      item_id: ITEM,
      reason_tag: 'matches_taste',
      ...(label === undefined ? {} : { reason_label: label }),
    },
  ],
  savings: [],
  lead_item_id: ITEM,
});

const labelOf = (label: string | undefined) =>
  keepGoodLabels(withLabel(label), context).highlights[0]?.reason_label;

describe('pick labels', () => {
  it('keeps a short label, trimmed', () => {
    expect(labelOf('  YOU PICKED STREET FOOD ')).toBe('YOU PICKED STREET FOOD');
    expect(labelOf('BẠN MÊ ĐỒ ĂN VỈA HÈ')).toBe('BẠN MÊ ĐỒ ĂN VỈA HÈ');
  });

  it('drops a label that is too long, numbered, names someone else, or empty', () => {
    expect(labelOf('A'.repeat(REASON_LABEL_MAX + 1))).toBeUndefined();
    expect(labelOf('TOP 3 FOR YOU')).toBeUndefined();
    expect(labelOf('MINH LOVES IT')).toBeUndefined();
    expect(labelOf('   ')).toBeUndefined();
  });

  it('leaves a pick without a label as it is, with its tag', () => {
    const [pick] = keepGoodLabels(withLabel(undefined), context).highlights;
    expect(pick).toEqual({ item_id: ITEM, reason_tag: 'matches_taste' });
  });
});
