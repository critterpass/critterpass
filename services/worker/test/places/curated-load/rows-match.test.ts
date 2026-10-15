/**
 * Reading a curated places line and choosing its row: a fee or hours without the page they were
 * read on are an estimate; a second-version line's planning facts reach the note and its essential
 * rank flags the place (taken back when a later file drops it); a broken line is reported by number; the same name near the point is
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
import { mergeCuratedNote } from '../../../src/places/curated-load/load';
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

  const V2 = {
    ...LINE,
    area: 'Jongno',
    best_times: ['morning', 'afternoon'],
    busy_windows: [{ days: 'weekends', from: 11, to: 15, level: 'busy' }],
    tags: ['history', 'photo_spots'],
    prominence: 'icon',
    essential_rank: 1,
    indoor: false,
    blog_count: 6,
    pairs_with: ['Bukchon Hanok Village', 'A place not in the file'],
  };

  it('writes a second-version line’s planning facts into the note, pairs resolved to rows', () => {
    const { rows, rejected } = parseJsonLines(JSON.stringify(V2), curatedPlaceRowSchema);
    expect(rejected).toEqual([]);
    const placed = new Map([['bukchon hanok village', '0199e5a0-0000-7000-8000-000000000001']]);
    const note = curatedNoteLines(rows[0]!, 1, placed);
    expect(note.lines.curated).toMatchObject({
      rank: 1,
      best_times: ['morning', 'afternoon'],
      essential_rank: 1,
      tags: ['history', 'photo_spots'],
      area: 'Jongno',
      prominence: 'icon',
      indoor: false,
      blog_count: 6,
      pairs_with: [
        { name: 'Bukchon Hanok Village', poi_id: '0199e5a0-0000-7000-8000-000000000001' },
        { name: 'A place not in the file' },
      ],
    });
    // The first visit is built around it.
    expect(note.lines).toMatchObject({ must_see: true, essential: true });
    // A first-version line sets none of it.
    const v1 = curatedNoteLines(curatedPlaceRowSchema.parse(LINE), 2);
    expect(v1.lines.curated.best_times).toBeUndefined();
    expect('essential' in v1.lines).toBe(false);
  });

  it('keeps a food place’s meal role and dish, and refuses facts outside the vocabulary', () => {
    const food = {
      ...V2,
      category: 'food',
      essential_rank: null,
      meal_role: 'light',
      dish: 'Bánh mì with pâté',
    };
    const note = curatedNoteLines(curatedPlaceRowSchema.parse(food), 4);
    expect(note.lines.curated).toMatchObject({ meal_role: 'light', dish: 'Bánh mì with pâté' });
    expect(note.lines.curated.essential_rank).toBeUndefined();
    const text = [
      { ...V2, best_times: ['brunch'] },
      { ...V2, tags: ['vibes'] },
      { ...V2, busy_windows: [{ days: 'every_day', from: 14, to: 10, level: 'busy' }] },
      { ...V2, essential_rank: 9 },
      { ...food, meal_role: 'feast' },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n');
    expect(parseJsonLines(text, curatedPlaceRowSchema).rejected.map((r) => r.line)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});

describe('writing a curated line over a stored note', () => {
  const ranked = curatedNoteLines(curatedPlaceRowSchema.parse({ ...LINE, essential_rank: 2 }), 1);
  const unranked = curatedNoteLines(curatedPlaceRowSchema.parse(LINE), 1);

  it('flags a ranked place and takes the flags back when a later file drops its rank', () => {
    const first = mergeCuratedNote({ etiquette: 'Quiet, please.' }, ranked);
    expect(first).toMatchObject({ must_see: true, essential: true, etiquette: 'Quiet, please.' });
    const second = mergeCuratedNote(first, unranked);
    expect(second['must_see']).toBeUndefined();
    expect(second['essential']).toBeUndefined();
    expect(second['etiquette']).toBe('Quiet, please.');
  });

  it('leaves an editors’ must-see alone when no curated rank ever set it', () => {
    const note = mergeCuratedNote({ must_see: true }, unranked);
    expect(note['must_see']).toBe(true);
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
    const square = row('square', 'Times Square, New York', STRONG_NAME_RADIUS_M + 600, {
      category: 'other',
    });
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
