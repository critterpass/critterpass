/**
 * Crew can't agree posts what the screen says: the chosen way against leaving the place out
 * ("Suggest the first one", "…the second one"), or the guide's two ways against each other; the
 * options read from the api skip what this build does not know; and who has not said reads the
 * way the render does ("Rin and you haven't said").
 */
import { i18n as lingui } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import { silentLine, splitFooter, splitOptionsParser, suggestPost, votePost } from '../split-model';

beforeAll(() => {
  lingui.loadAndActivate({ locale: 'en', messages: {} });
});

const parsed = splitOptionsParser.safeParse({
  options: [
    {
      option_id: 'keen1',
      kind: 'split_group',
      title: 'Keen ones go early',
      body: 'Maya and Jordan leave Sat at 04:30.',
      attendee_ids: ['m', 'j'],
      going_count: 2,
      cost: { minor: 450000, currency: 'IDR', per: 'car' },
    },
    {
      option_id: 'alt1',
      kind: 'alternative',
      title: 'Tirta Gangga instead',
      body: 'Everyone goes Sunday morning.',
      attendee_ids: [],
      going_count: 6,
      cost: null,
    },
    { option_id: 'x', kind: 'a_kind_from_later', title: 'Later', body: '', going_count: 1 },
  ],
});
const options = parsed.success ? parsed.data : [];

describe('split decisions', () => {
  it('reads the known options only', () => {
    expect(options.map((o) => o.optionId)).toEqual(['keen1', 'alt1']);
    expect(options[0]?.cost).toEqual({ minor: 450000, currency: 'IDR', per: 'car' });
  });

  it('suggests the chosen way on its own', () => {
    expect(suggestPost(options, 0)).toEqual({
      mode: 'suggest',
      optionIds: ['keen1'],
      label: 'Suggest the first one',
    });
    expect(suggestPost(options, 1)).toMatchObject({
      mode: 'suggest',
      optionIds: ['alt1'],
      label: 'Suggest the second one',
    });
    expect(suggestPost([], 0)).toBeNull();
  });

  it('puts both ways to a vote, and only with two', () => {
    expect(votePost(options)).toMatchObject({ mode: 'vote', optionIds: ['keen1', 'alt1'] });
    expect(votePost(options.slice(0, 1))).toBeNull();
  });

  it('says who has not said, with you last', () => {
    const list = (names: readonly string[]) => names.join(' and ');
    const name = (uid: string) => (uid === 'r' ? 'Rin' : uid);
    expect(silentLine(['me', 'r'], 'me', name, list)).toBe("Rin and you haven't said");
    expect(silentLine(['r'], 'me', name, list)).toBe("Rin hasn't said");
    expect(silentLine(['me'], 'me', name, list)).toBe("You haven't said");
    expect(silentLine([], 'me', name, list)).toBeNull();
  });
});

describe('splitFooter', () => {
  const base = { posted: false, loading: false, options: 2, said: true, canChat: true };

  it('offers the buttons while there are ways and nothing was posted', () => {
    expect(splitFooter(base)).toEqual({ kind: 'post' });
  });

  it('leaves only the way into crew chat once a way was posted', () => {
    expect(splitFooter({ ...base, posted: true })).toEqual({ kind: 'chat', reason: 'posted' });
  });

  it('with no ways, opens crew chat only after she has said where she stands', () => {
    expect(splitFooter({ ...base, options: 0 })).toEqual({ kind: 'chat', reason: 'no_ways' });
    expect(splitFooter({ ...base, options: 0, said: false })).toEqual({ kind: 'none' });
    expect(splitFooter({ ...base, options: 0, loading: true })).toEqual({ kind: 'none' });
  });
});
