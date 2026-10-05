/**
 * Add from a link as events arrive: places tick in in the post's order even when a match comes
 * before the source, an error mid-stream keeps what was matched, and a retry starts clean. Only
 * ticked places (and a picked one for "pick one") are saved, each once.
 */
import type { ImportCandidate, ImportEvent } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import {
  chosenPlaces,
  LINK_IMPORT_START,
  linkImportReducer,
  sharedBestDay,
  splitBySlot,
  type LinkImportState,
} from '../link-import-model';

const place = (n: number, name: string, dayNo: number | null): ImportCandidate => ({
  poi_id: `0199a3f0-0000-7000-8000-0000000000${String(10 + n)}`,
  name,
  category: 'nature',
  meta: 'Tegallalang',
  fit_best: dayNo === null ? null : { day_no: dayNo, grade: 'good' },
});

const CEPUNG = place(1, 'Tukad Cepung', 6);
const TIBUMANA = place(2, 'Tibumana', 6);
const SWINGS = [place(3, 'Aloha Swing', 2), place(4, 'Bali Swing', 3), place(5, 'Zen Swing', null)];

const events: ImportEvent[] = [
  { event: 'match', data: { label: 'Tukad Cepung', ...CEPUNG } },
  {
    event: 'source',
    data: {
      platform: 'tiktok',
      read: 'post_text',
      title: '3 waterfalls nobody tells you about',
      author: '@balibites',
    },
  },
  { event: 'match', data: { label: 'Tibumana', ...TIBUMANA } },
  { event: 'ambiguous', data: { label: 'the swing with the view', candidates: SWINGS } },
  { event: 'done', data: { matched: 2, ambiguous: 1, unknown: 0 } },
];

const run = (list: readonly ImportEvent[], from: LinkImportState = LINK_IMPORT_START) =>
  list.reduce((state, event) => linkImportReducer(state, { type: 'event', event }), from);

describe('link import events', () => {
  it('keeps the post’s order with a match before the source, ticking the sure ones', () => {
    const state = run(events);
    expect(state.status).toBe('done');
    expect(state.source?.author).toBe('@balibites');
    expect(state.matches.map((match) => [match.label, match.kind])).toEqual([
      ['Tukad Cepung', 'sure'],
      ['Tibumana', 'sure'],
      ['the swing with the view', 'ambiguous'],
    ]);
    expect(chosenPlaces(state).map((chosen) => chosen.name)).toEqual(['Tukad Cepung', 'Tibumana']);
    expect(sharedBestDay(chosenPlaces(state))).toBe(6);
  });

  it('a repeated event updates its place instead of adding it twice', () => {
    const state = run([...events.slice(0, 3), events[0] as ImportEvent]);
    expect(state.matches).toHaveLength(2);
  });

  it('an error mid-stream keeps what was matched; a late done does not hide it', () => {
    const state = run([
      ...events.slice(0, 2),
      { event: 'error', data: { code: 'busy' } },
      events[4] as ImportEvent,
    ]);
    expect([state.status, state.error]).toEqual(['error', 'busy']);
    expect(chosenPlaces(state).map((chosen) => chosen.name)).toEqual(['Tukad Cepung']);
    const unreachable = linkImportReducer(run(events.slice(0, 1)), { type: 'unreachable' });
    expect(unreachable.error).toBe('unreachable');
  });

  it('a retry starts clean', () => {
    const failed = run([events[0] as ImportEvent, { event: 'error', data: { code: 'busy' } }]);
    const retried = run(events, linkImportReducer(failed, { type: 'restart' }));
    expect([retried.status, retried.error, retried.matches.length]).toEqual(['done', null, 3]);
  });

  it('saves a picked swing and leaves out an unticked waterfall', () => {
    const state = run(events);
    const picked = linkImportReducer(state, {
      type: 'pick',
      label: 'the swing with the view',
      poiId: (SWINGS[1] as ImportCandidate).poi_id,
    });
    const unticked = linkImportReducer(picked, { type: 'toggle', label: 'Tibumana' });
    expect(chosenPlaces(unticked).map((chosen) => chosen.name)).toEqual([
      'Tukad Cepung',
      'Bali Swing',
    ]);
    expect(linkImportReducer(state, { type: 'toggle', label: 'the swing with the view' })).toBe(
      state,
    );
  });
});

describe('putting the chosen places on a day', () => {
  const DAY = '0199a3f0-0000-7000-8000-00000000da06';
  const fit = (poiId: string, slot: boolean) =>
    ({
      poi_id: poiId,
      days: [
        {
          day_id: DAY,
          slot: slot
            ? { starts_at: '2026-10-24T02:00:00Z', ends_at: '2026-10-24T03:00:00Z' }
            : null,
        },
      ],
    }) as unknown as Parameters<typeof splitBySlot>[1][number];

  it('keeps a place the day has no room for, for Ideas', () => {
    const split = splitBySlot(
      [CEPUNG, TIBUMANA],
      [fit(CEPUNG.poi_id, true), fit(TIBUMANA.poi_id, false)],
      DAY,
    );
    expect(split.slotted.map((slot) => slot.place.name)).toEqual(['Tukad Cepung']);
    expect(split.unslotted.map((place) => place.name)).toEqual(['Tibumana']);
  });

  it('keeps a place the fit answer does not mention', () => {
    const split = splitBySlot([CEPUNG, TIBUMANA], [fit(CEPUNG.poi_id, true)], DAY);
    expect(split.unslotted).toEqual([TIBUMANA]);
  });
});
