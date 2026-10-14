/**
 * Reading a curated places line and choosing its row: a fee or hours without the page they were
 * read on are an estimate; a broken line is reported by number; the same name near the point is
 * the place, a shop named after the area is not, and nothing far off or unnamed ever is.
 */
import { describe, expect, it } from 'vitest';

import {
  chooseCuratedMatch,
  SAME_NAME_RADIUS_M,
  STRONG_NAME_RADIUS_M,
  withoutBranchNote,
  type CuratedLead,
  type MatchCandidate,
} from '../../../src/places/curated-load/match';
import { parseJsonLines } from '../../../src/places/curated-load/files';
import { curatedNoteLines, curatedPlaceRowSchema } from '../../../src/places/curated-load/rows';
import { plainWords } from '../../../src/places/pick/match';

const LINE = {
  destination: 'kr-seoul',
  name_en: 'Gyeongbokgung Palace',
  name_local: '경복궁',
  category: 'temple_shrine',
  subtype: 'palace',
  address: '161 Sajik-ro, Jongno-gu, Seoul',
  lat: 37.5796,
  lng: 126.977,
  why_go_en: 'The grandest of the five palaces.',
  why_go_vi: 'Cung điện lớn nhất trong năm cung.',
  visit_minutes: 120,
  best_time: 'Weekday mornings',
  busy: 'Crowded at weekends from 11:00.',
  entry_fee: { text: 'Adults 3,000 won', source_url: 'https://royal.khs.go.kr/a', estimate: false },
  hours: { text: '9:00-18:00, closed Tue', source_url: null, estimate: true },
  tips_en: ['Wear a hanbok and enter free.'],
  tips_vi: ['Mặc hanbok để vào miễn phí.'],
  dress: null,
  getting_there: 'Gyeongbokgung station, exit 5.',
  sources: ['https://royal.khs.go.kr/a', 'https://royal.khs.go.kr/a'],
};

describe('curated places lines', () => {
  it('keeps a fee read on a page as cited and labels unconfirmed hours an estimate', () => {
    const { rows, rejected } = parseJsonLines(JSON.stringify(LINE), curatedPlaceRowSchema);
    expect(rejected).toEqual([]);
    const note = curatedNoteLines(rows[0]!, 3);
    expect(note.lines.curated).toEqual({
      rank: 3,
      fee: { text: 'Adults 3,000 won', basis: 'cited', source_url: 'https://royal.khs.go.kr/a' },
      hours: { text: '9:00-18:00, closed Tue', basis: 'estimate' },
      crowd_basis: 'estimate',
      getting_there: 'Gyeongbokgung station, exit 5.',
      sources: ['https://royal.khs.go.kr/a'],
    });
    expect(note.lines.crowd_hint).toBe('Crowded at weekends from 11:00.');
    expect(note.lines.time_needed_min).toBe(120);
    expect(note.vi).toEqual({
      why_go: 'Cung điện lớn nhất trong năm cung.',
      tips: ['Mặc hanbok để vào miễn phí.'],
    });
  });

  it('reports a broken line by its number and loads the rest', () => {
    const confirmedWithoutPage = { ...LINE, entry_fee: { text: 'Free', estimate: false } };
    const text = [
      JSON.stringify(LINE),
      '{not json',
      '',
      JSON.stringify(confirmedWithoutPage),
      JSON.stringify({ ...LINE, tips_vi: [] }),
    ].join('\n');
    const { rows, rejected } = parseJsonLines(text, curatedPlaceRowSchema);
    expect(rows).toHaveLength(1);
    expect(rejected.map((r) => r.line)).toEqual([2, 4, 5]);
  });
});

const plain = plainWords('Seoul', 'South Korea');
const lead: CuratedLead = {
  name: 'Myeongdong',
  localName: '명동',
  category: 'shopping',
  lat: 37.5636,
  lng: 126.9854,
};

function row(id: string, name: string, distanceM: number, extra: Partial<MatchCandidate> = {}) {
  return {
    id,
    name,
    nameLocal: null,
    category: 'shopping',
    lat: 0,
    lng: 0,
    address: null,
    quality: 1,
    distanceM,
    similarity: 0.3,
    ...extra,
  } satisfies MatchCandidate;
}

describe('choosing the row a curated place is', () => {
  it('reads a Latin area in brackets after a Latin name as a branch, other brackets as names', () => {
    const words = new Set(['myeongdong']);
    expect(withoutBranchNote('MNG (Myeongdong)', words)).toBe('MNG');
    expect(withoutBranchNote('인사동 (Insadong)', words)).toBe('인사동 (Insadong)');
    expect(withoutBranchNote('Myeongdong Street (Myeongdong)', words)).toBe(
      'Myeongdong Street (Myeongdong)',
    );
  });

  it('takes the same name near the point, the nearer of two, and never a branch', () => {
    const verdict = chooseCuratedMatch(
      lead,
      [
        row('branch', 'MNG (Myeongdong)', 40, { similarity: 0.7 }),
        row('far', '명동', SAME_NAME_RADIUS_M - 1, { category: 'other' }),
        row('near', 'Myeongdong', 120),
      ],
      plain,
    );
    expect(verdict).toMatchObject({ kind: 'match', row: { id: 'near' } });
  });

  it('leaves a taken row to the next place and reports a place no row carries', () => {
    const rows = [row('near', 'Myeongdong', 120), row('cafe', 'Cafe Ondo', 30)];
    expect(chooseCuratedMatch(lead, rows, plain, new Set(['near']))).toEqual({
      kind: 'none',
      closest: rows[1],
    });
  });

  it('takes nearly the same text close by, but not far off', () => {
    const seoullo: CuratedLead = {
      ...lead,
      name: 'Seoullo 7017',
      localName: '서울로7017',
      category: 'nature',
    };
    const spaced = row('spaced', '서울로 7017', 128, { similarity: 0.55, category: 'nature' });
    expect(chooseCuratedMatch(seoullo, [spaced], plain)).toMatchObject({
      kind: 'match',
      row: { id: 'spaced' },
    });
    expect(chooseCuratedMatch(seoullo, [{ ...spaced, distanceM: 400 }], plain).kind).toBe('none');
  });
});

describe('matching a curated place only under its own name', () => {
  const bangkok = plainWords('Bangkok', 'Thailand');
  const newYork = plainWords('New York', 'United States');

  it('needs the full name beyond a short walk, not just the same words', () => {
    const times: CuratedLead = {
      name: 'Times Square',
      localName: null,
      category: 'other',
      lat: 40.758,
      lng: -73.9855,
    };
    const lookalike = row('lookalike', 'Time Square Square', 889, { category: 'museum' });
    expect(chooseCuratedMatch(times, [lookalike], newYork)).toEqual({
      kind: 'none',
      closest: lookalike,
    });
    const square = row('square', 'Times Square', STRONG_NAME_RADIUS_M + 600, { category: 'other' });
    expect(chooseCuratedMatch(times, [lookalike, square], newYork)).toMatchObject({
      kind: 'match',
      row: { id: 'square' },
    });
    expect(
      chooseCuratedMatch(times, [{ ...lookalike, distanceM: STRONG_NAME_RADIUS_M - 1 }], newYork),
    ).toMatchObject({ kind: 'match', row: { id: 'lookalike' } });
  });

  it('never takes a clearly different Latin name, even when the local names agree', () => {
    const rotFai: CuratedLead = {
      name: 'Rot Fai Ratchada Train Night Market',
      localName: 'ตลาดนัดรถไฟรัชดา',
      category: 'market',
      lat: 13.77,
      lng: 100.5662,
    };
    const other = row('other', 'Banker-Tattoo Train Night Market Ratchada', 120, {
      nameLocal: 'ตลาดนัดรถไฟรัชดา',
      category: 'other',
    });
    expect(chooseCuratedMatch(rotFai, [other], bangkok).kind).toBe('none');
    const local = row('local', 'ตลาดนัดรถไฟรัชดา', 120, { category: 'market' });
    expect(chooseCuratedMatch(rotFai, [other, local], bangkok)).toMatchObject({
      kind: 'match',
      row: { id: 'local' },
    });
  });
});
