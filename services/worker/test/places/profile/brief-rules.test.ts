import type { BriefLead } from '@cp/ai';
import { describe, expect, it } from 'vitest';

import { briefLines } from '../../../src/places/profile/brief-jobs';
import { classifyMatch } from '../../../src/places/profile/brief-match';
import { perPersonMinor } from '../../../src/places/profile/brief-store';
import { plainWords, rankNamedPlace, type PickCandidate } from '../../../src/places/pick/match';

const plain = plainWords('Đà Lạt', 'VN');

const row = (id: string, name: string, category: string, extra: Partial<PickCandidate> = {}) => ({
  id,
  name,
  nameLocal: null,
  category,
  lat: 11.9,
  lng: 108.4,
  address: null,
  quality: 2,
  ...extra,
});

const lead = (name: string, localName: string | null, kind: BriefLead['kind']): BriefLead => ({
  name,
  localName,
  kind,
  area: null,
  why: { en: 'A line.' },
  source: { url: 'https://example.vn', title: '', quote: name },
});

const verdictOf = (l: BriefLead, rows: PickCandidate[]) =>
  classifyMatch(rankNamedPlace(l, rows, plain));

describe('brief name matching', () => {
  it('takes the one row that carries the same name', () => {
    const verdict = verdictOf(lead('Datanla Waterfall', 'Thác Datanla', 'nature'), [
      row('a', 'Thác Datanla', 'nature'),
      row('b', 'Datanla Coffee', 'food'),
    ]);
    expect(verdict.kind === 'match' && verdict.row.id).toBe('a');
  });

  it('sends two rows equally close (one place under two sources) to the tiebreak', () => {
    const verdict = verdictOf(lead('Crazy House', 'Biệt thự Hằng Nga', 'other'), [
      row('a', 'Crazy House', 'other'),
      row('b', 'Crazy House', 'museum'),
    ]);
    expect(verdict.kind).toBe('close');
    if (verdict.kind === 'close') expect(verdict.rows.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('sends a name only held in the other to the tiebreak', () => {
    const verdict = verdictOf(lead('Bảo Đại Palace', 'Dinh Bảo Đại', 'museum'), [
      row('a', 'Dinh III Bảo Đại', 'museum'),
    ]);
    expect(verdict.kind === 'close' && verdict.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('drops a name no row carries, and never takes a shop of another kind named after a sight', () => {
    expect(verdictOf(lead('Langbiang Mountain', null, 'nature'), []).kind).toBe('none');
    expect(
      verdictOf(lead('Langbiang Mountain', null, 'nature'), [
        row('a', 'Langbiang Mountain Brewery', 'nightlife'),
      ]).kind,
    ).toBe('none');
  });
});

describe('brief stays and lines', () => {
  it('stores a room price as per person minor units, two to a room', () => {
    expect(perPersonMinor(400000, 'VND')).toBe(200000);
    expect(perPersonMinor(50, 'USD')).toBe(2500);
  });

  it('translates only the English lines a locale lacks', () => {
    expect(
      briefLines(
        [{ why: { en: 'Falls.', fr: 'Chutes.' } }, { why: { en: 'Lake.' } }, { why: {} }],
        [{ why: { en: 'Pho.' } }],
        'fr',
      ),
    ).toEqual([
      { id: 'e1', text: 'Lake.' },
      { id: 'f0', text: 'Pho.' },
    ]);
  });
});
