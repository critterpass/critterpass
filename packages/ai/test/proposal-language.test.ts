/**
 * A proposal version and a private objection reply in the reader's app language: the prompt names
 * the language and tells the model to copy the facts as given; the validator still refuses another
 * crew member's name, but in a language where first names are everyday words it counts a name
 * only as written.
 */
import { describe, expect, it } from 'vitest';

import {
  buildObjectionRequest,
  buildVersionRequest,
  namesIn,
  validateVersion,
  type VersionContext,
  type VersionReply,
} from '../src';

const ITEM = '0199a0f2-0000-7000-8000-00000000d001';

const context = (locale?: string): VersionContext => ({
  guide: 'chava',
  recipientFirstName: 'Trang',
  destination: 'Da Nang',
  dates: '2026-10-02 to 2026-10-04',
  tasteTags: ['street_food'],
  items: [{ id: ITEM, title: 'Mì Quảng Bà Mua', day: 1, category: 'food', must_do: true }],
  share: '4.200.000 ₫',
  savings: [],
  otherNames: ['Minh', 'Linh'],
  ...(locale === undefined ? {} : { locale }),
});

const reply = (body: string): VersionReply => ({
  slides: [{ headline: 'Mì Quảng trước tiên', body, item_id: ITEM }],
  poster: { title: 'Đà Nẵng gọi' },
  postcard: { message: 'Hẹn gặp lại!' },
  highlights: [],
  savings: [],
  lead_item_id: ITEM,
});

describe('the version prompt', () => {
  it('names the reader language and the copy-as-given rules for a Vietnamese reader', () => {
    const request = JSON.stringify(buildVersionRequest(context('vi')));
    expect(request).toContain("Write Trang's version. [Reply language: Vietnamese (vi).]");
    expect(request).toContain('Copy every amount, date and number exactly as the data gives it');
    expect(request).toContain('never say a room or a stay is held');
  });

  it('is unchanged for an English reader', () => {
    const english = JSON.stringify(buildVersionRequest(context('en')));
    expect(english).toBe(JSON.stringify(buildVersionRequest(context())));
    expect(english).not.toContain('Reply language');
  });
});

describe('the objection prompt', () => {
  it('answers a Vietnamese member in Vietnamese', () => {
    const input = {
      guide: 'chava' as const,
      reason: 'cost' as const,
      organiser: 'Minh',
      options: [
        { id: 'follow_up', kind: 'follow_up' as const, label: 'Ask me later', saves: null },
      ],
      text: null,
    };
    expect(JSON.stringify(buildObjectionRequest({ ...input, locale: 'vi' }))).toContain(
      '[Reply language: Vietnamese (vi).]',
    );
    expect(JSON.stringify(buildObjectionRequest(input))).not.toContain('Reply language');
  });
});

describe("another crew member's name", () => {
  it('is caught in English whatever the case', () => {
    expect(namesIn('minh is paying for dinner', ['Minh'])).toEqual(['Minh']);
  });

  it('counts only as written where names are everyday words', () => {
    expect(namesIn('Phố cổ lung linh, thông minh lắm.', ['Linh', 'Minh'], true)).toEqual([]);
    expect(namesIn('Linh sẽ thích món này.', ['Linh', 'Minh'], true)).toEqual(['Linh']);
    expect(namesIn('Minh, ăn thôi!', ['Linh', 'Minh'], true)).toEqual(['Minh']);
  });

  it('lets a Vietnamese version say "lung linh" and refuses one that names Linh', () => {
    const lanterns = reply('Phố cổ lung linh đèn lồng, ăn một tô là thông minh nhất.');
    expect(validateVersion(lanterns, context('vi'))).toEqual({ ok: true });
    // The same words in an English reader's version are still refused: nothing loosens there.
    expect(validateVersion(lanterns, context('en'))).toEqual({ ok: false, reason: 'names_crew' });
    expect(validateVersion(reply('Linh cũng sẽ mê món này.'), context('vi'))).toEqual({
      ok: false,
      reason: 'names_crew',
    });
  });

  it('still refuses a number the data does not hold, in any language', () => {
    expect(validateVersion(reply('Ăn 3 tô cũng chưa đủ.'), context('vi'))).toEqual({
      ok: false,
      reason: 'ungrounded:3',
    });
  });
});
