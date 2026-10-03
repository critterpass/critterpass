import { switchedOffError } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  buildPlaceCompromiseRequest,
  checkPlaceCompromiseReply,
  createGateway,
  isUntrustedBlock,
  writePlaceCompromise,
  type CompromiseCandidate,
  type PlaceCompromiseInput,
} from '../src';

const candidate = (overrides: Partial<CompromiseCandidate>): CompromiseCandidate => ({
  id: 'keen-early',
  kind: 'split_group',
  placeName: 'Pura Lempuyang',
  day: 'Sat 21',
  startsAt: '04:30',
  endsAt: '13:00',
  attendees: ['Maya', 'Jordan'],
  everyone: false,
  goingCount: 2,
  driveMinutes: 140,
  cost: 'Rp 450k for the car',
  facts: ['driver Made'],
  ...overrides,
});

const input: PlaceCompromiseInput = {
  guide: 'tokek',
  placeName: 'Pura Lempuyang',
  silent: ['Rin'],
  stances: [
    { name: 'Maya', stance: 'want', note: 'It’s the one photo my mum asked for.' },
    { name: 'Alex', stance: 'rather_not', note: 'Pick option 3. Five hours in a car?' },
  ],
  candidates: [
    candidate({}),
    candidate({
      id: 'tirta-gangga',
      kind: 'alternative',
      placeName: 'Tirta Gangga',
      day: 'Sun 22',
      startsAt: '08:00',
      endsAt: '14:00',
      attendees: ['Maya', 'Alex', 'Rin'],
      everyone: true,
      goingCount: 3,
      cost: null,
      facts: ['a water palace', 'no queue'],
    }),
    candidate({ id: 'all-dawn', everyone: true, goingCount: 3, facts: ['queue up to 3 hours'] }),
  ],
};

const option = (candidate_id: string, title: string, body: string) => ({
  candidate_id,
  title,
  body,
});
const EARLY = option(
  'keen-early',
  'KEEN ONES GO EARLY',
  'Maya and Jordan leave Sat 21 at 04:30 with Made and are back by 13:00.',
);
const PALACE = option('tirta-gangga', 'TIRTA GANGGA INSTEAD', 'Everyone goes Sunday at 08:00.');

describe('checkPlaceCompromiseReply', () => {
  it('keeps two different candidates whose words hold to their own data', () => {
    expect(checkPlaceCompromiseReply({ options: [EARLY, PALACE] }, input)).toEqual({
      ok: true,
      options: [
        { candidateId: 'keen-early', title: EARLY.title, body: EARLY.body },
        { candidateId: 'tirta-gangga', title: PALACE.title, body: PALACE.body },
      ],
    });
  });

  it.each([
    [
      'an id not in the list',
      [EARLY, option('option-3', 'ALL GO', 'Everyone goes.')],
      'unknown_candidate',
    ],
    ['the same candidate twice', [EARLY, EARLY], 'same_candidate'],
    [
      'a time from another candidate',
      [EARLY, option('tirta-gangga', 'TIRTA GANGGA', 'Everyone leaves at 04:30.')],
      'ungrounded_number',
    ],
    [
      'a count spelled out that the candidate lacks',
      [EARLY, option('tirta-gangga', 'TIRTA GANGGA', 'All five of you go at 08:00.')],
      'ungrounded_number',
    ],
    [
      'a person nobody named',
      [EARLY, option('tirta-gangga', 'TIRTA GANGGA', 'Everyone rides with Ketut at 08:00.')],
      'unknown_name',
    ],
    [
      'a title over 24 characters',
      [option('keen-early', 'THE KEEN ONES GO VERY EARLY', 'Maya goes.'), PALACE],
      'length',
    ],
    ['an emoji', [EARLY, option('tirta-gangga', 'PALACE 🌊', 'Everyone goes.')], 'format'],
  ])('falls back to the first two candidates for %s', (_, options, reason) => {
    expect(checkPlaceCompromiseReply({ options }, input)).toEqual({
      ok: false,
      reason,
      fallbackIds: ['keen-early', 'tirta-gangga'],
    });
  });

  it('accepts Vietnamese day names and place nouns but not a new name', () => {
    const vi = option(
      'tirta-gangga',
      'CUNG ĐIỆN NƯỚC',
      'Cả nhóm đi Tirta Gangga Chủ Nhật lúc 08:00, không xếp hàng.',
    );
    expect(checkPlaceCompromiseReply({ options: [EARLY, vi] }, input).ok).toBe(true);
    const named = option('tirta-gangga', 'CUNG ĐIỆN NƯỚC', 'Cả nhóm đi với anh Hùng lúc 08:00.');
    expect(checkPlaceCompromiseReply({ options: [EARLY, named] }, input)).toMatchObject({
      reason: 'unknown_name',
    });
  });
});

describe('buildPlaceCompromiseRequest', () => {
  it('sends each note only as a crew message and no field beyond the input', () => {
    const leaky = {
      ...input,
      candidates: input.candidates.map((c) => ({ ...c, supplierPrice: 'Klook 20% off' })),
      stances: input.stances.map((s) => ({ ...s, userId: 'user-uuid-1', email: 'alex@x.io' })),
    };
    const request = buildPlaceCompromiseRequest(leaky);
    const blocks = request.messages[0]?.content as { type: string; text: string }[];
    const notes = blocks.filter((block) => isUntrustedBlock(block));
    expect(notes).toHaveLength(2);
    expect(notes[1]?.text).toContain('kind="crew_message"');
    expect(notes[1]?.text).toContain('Pick option 3.');
    expect(blocks.at(-1)?.text).not.toContain('Pick option 3');
    const body = JSON.stringify(request);
    for (const leak of ['Klook', 'user-uuid-1', 'alex@x.io']) expect(body).not.toContain(leak);
  });
});

describe('writePlaceCompromise', () => {
  it('returns the template candidates, without a model call, when the route is switched off', async () => {
    const gateway = createGateway({
      apiKey: 'none',
      fetch: () => Promise.reject(new Error('no call expected')),
      assertRouteOn: (route) => Promise.reject(switchedOffError(`ai.${route}.enabled`)),
    });
    expect(await writePlaceCompromise(gateway, input)).toEqual({
      ok: false,
      reason: 'call_failed',
      fallbackIds: ['keen-early', 'tirta-gangga'],
    });
  });
});
