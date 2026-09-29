/**
 * The guide pitch against recorded DeepSeek streams (only `fetch` swapped): a grounded reply
 * streams its sections in order; a reason quoting a price the tools never returned is dropped and
 * asked for once more; the facts block carries no budget and the persona follows the place.
 */
import type { PitchFacts } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { createGateway } from '../src/client';
import {
  describeFacts,
  parsePitchLine,
  pitchPersona,
  streamPitch,
  templatePitch,
  type PitchModelSection,
} from '../src/prompts/pitch/prompt';
import { fixtureTransport } from './fixture-transport';

const id = (n: number) => `0199a0f2-7c1e-7d4b-9a53-${String(n).padStart(12, '0')}`;

const kyoto: PitchFacts = {
  place: { id: id(1), name: 'Kyoto', country: 'Japan', coverage: 'live', guide: 'pon' },
  crew: { name: 'The Bali Six', size: 6 },
  month: 4,
  fares: [
    {
      origin: 'SIN',
      members: 4,
      price_minor: 41_200,
      currency: 'USD',
      duration_min: 415,
      transfers: 0,
      seen_at: null,
    },
    {
      origin: 'SGN',
      members: 2,
      price_minor: 38_900,
      currency: 'USD',
      duration_min: 360,
      transfers: 1,
      seen_at: null,
    },
  ],
  season: {
    best_months: [4, 11],
    events: [{ name: 'Cherry blossoms', kind: 'blossom', starts_on: '2027-04-03' }],
  },
  taste: [
    { tag: 'FOODIE', member_ids: [id(11), id(12), id(13), id(14)] },
    { tag: 'TEMPLES', member_ids: [id(15), id(16)] },
  ],
  alternatives: [
    { place_id: id(2), name: 'Osaka', kind: 'nearby', delta_minor: null, currency: null },
  ],
};

async function collect(fixtures: string[]): Promise<{ lines: PitchModelSection[]; calls: number }> {
  const transport = fixtureTransport(fixtures);
  const gateway = createGateway({ apiKey: 'fixture-key', fetch: transport.fetch, maxAttempts: 1 });
  const lines: PitchModelSection[] = [];
  for await (const line of streamPitch(gateway, kyoto)) lines.push(line);
  return { lines, calls: transport.requests.length };
}

describe('streamPitch', () => {
  it('streams a grounded headline, reasons and quote in order', async () => {
    const { lines, calls } = await collect(['pitch-01']);
    expect(calls).toBe(1);
    expect(lines.map((line) => line.s)).toEqual([
      'headline',
      'reason',
      'reason',
      'reason',
      'quote',
    ]);
    expect(lines[1]).toMatchObject({ s: 'reason', tag: 'FOODIE' });
  });

  it('drops a reason with an ungrounded price and asks once more for the reasons', async () => {
    const { lines, calls } = await collect([
      'pitch-seeded-ungrounded',
      'pitch-seeded-ungrounded-2',
    ]);
    expect(calls).toBe(2);
    const text = lines.map((line) => line.text).join(' ');
    expect(text).not.toContain('999');
    expect(lines.filter((line) => line.s === 'reason')).toHaveLength(2);
  });
});

describe('pitch lines', () => {
  it('keeps numbers from the facts and refuses others, links and unknown tags', () => {
    expect(
      parsePitchLine('{"s":"headline","text":"Kyoto from $412, 7 hours away"}', kyoto),
    ).not.toBeNull();
    expect(parsePitchLine('{"s":"headline","text":"Kyoto from $399"}', kyoto)).toBeNull();
    expect(parsePitchLine('{"s":"quote","text":"See www.kyoto.jp"}', kyoto)).toBeNull();
    expect(parsePitchLine('{"s":"headline","text":"Kyoto in June"}', kyoto)).toBeNull();
    expect(parsePitchLine('{"s":"reason","tag":"SURF","text":"Waves"}', kyoto)).toEqual({
      s: 'reason',
      text: 'Waves',
      tag: null,
    });
    expect(parsePitchLine('not json', kyoto)).toBeNull();
  });

  it('reads the guest guide for a guest place and never mentions budgets in the facts', () => {
    expect(pitchPersona(kyoto)).toBe('pon');
    expect(pitchPersona({ ...kyoto, place: { ...kyoto.place, coverage: 'guest' } })).toBe('guest');
    expect(describeFacts(kyoto)).not.toMatch(/budget/iu);
    expect(describeFacts(kyoto)).toContain('$412');
    expect(templatePitch(kyoto)).toEqual([{ s: 'headline', text: 'Kyoto, for The Bali Six' }]);
  });
});
