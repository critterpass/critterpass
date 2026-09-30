import { describe, expect, it } from 'vitest';

import {
  CONTENT_KINDS,
  bannedHelpPhrases,
  buildRelease,
  currentRelease,
  CURRENT_RELEASES,
  formItemSchema,
  isPhraseCardPublishable,
  isSafetyRecordPublishable,
  legendaryWindowItemSchema,
  loadRelease,
  phraseCardItemSchema,
  placeIndexItemSchema,
  ReleaseLoadError,
  spawnRuleItemSchema,
  windowCalendarLabel,
  windowMonths,
} from '../src';

const at = '2026-09-28T00:00:00.000Z';
const generatedBy = { batch_key: 'test', route: null, model: null, generated_at: at };

describe('designed release fixtures', () => {
  it('validate with matching checksums', () => {
    const forms = currentRelease('forms');
    const windows = currentRelease('windows');
    expect(forms?.items.map((f) => f.id)).toEqual([
      'cp-112:rare',
      'cp-112:epic',
      'cp-112:legendary',
      'cp-061:legendary',
    ]);
    expect(windows?.items).toHaveLength(6);
  });

  it('match the once-a-year calendar (3l-9)', () => {
    const windows = currentRelease('windows')?.items ?? [];
    const rows = windows.map((w) => {
      const label = windowCalendarLabel(w.rule);
      return `${label.top} ${label.bottom} ${w.place_line}`;
    });
    expect(rows).toEqual([
      'NOV 1–2 Mexico City · Día de Muertos',
      'APR EARLY Kyoto · the week the blossoms peak',
      'JUN 12 Lisbon · Santo António night',
      'JUN 24 Cusco · Inti Raymi',
      'AUG LATE Heimaey · puffling nights',
      'ANY DAY Bali · all six on Batur by sunrise',
    ]);
  });

  it('rejects a tampered release', () => {
    const raw = structuredClone(CURRENT_RELEASES.forms) as { items: { name: string }[] };
    raw.items[0]!.name = 'Tampered Tokek';
    expect(() => loadRelease(raw, 'forms')).toThrow(ReleaseLoadError);
  });

  it('rejects a release of another kind and repeated item keys', () => {
    expect(() => loadRelease(CURRENT_RELEASES.forms, 'windows')).toThrow(/expected a windows/u);
    const forms = currentRelease('forms')!;
    const doubled = buildRelease({
      kind: 'forms',
      version: 2,
      items: [forms.items[0]!, forms.items[0]!],
      generated_by: generatedBy,
      approved_by: null,
    });
    expect(() => loadRelease(doubled, 'forms')).toThrow(/appears twice/u);
  });

  it('covers every kind with an item schema', () => {
    expect(CONTENT_KINDS).toHaveLength(14);
  });
});

describe('form rules', () => {
  const base = currentRelease('forms')!.items[1]!;

  it('epic forms keep a pose and the pink edge', () => {
    expect(formItemSchema.safeParse({ ...base, pose: null }).success).toBe(false);
    expect(formItemSchema.safeParse({ ...base, edge: 'none' }).success).toBe(false);
  });

  it('xp follows rarity and the id names the critter and rarity', () => {
    expect(formItemSchema.safeParse({ ...base, xp: 1 }).success).toBe(false);
    expect(formItemSchema.safeParse({ ...base, id: 'cp-112:rare' }).success).toBe(false);
  });
});

describe('windows and spawn rules', () => {
  it('dated windows need a source, any-day windows a challenge', () => {
    const [dated, , , , , anyDay] = currentRelease('windows')!.items;
    expect(legendaryWindowItemSchema.safeParse({ ...dated, source_url: null }).success).toBe(false);
    expect(legendaryWindowItemSchema.safeParse({ ...anyDay, challenge: null }).success).toBe(false);
  });

  it('computes months, wrapping the new year', () => {
    expect(windowMonths({ type: 'annual_range', start: '12-30', end: '01-02' })).toEqual([12, 1]);
    expect(windowMonths({ type: 'any_day' })).toHaveLength(12);
  });

  const rule = {
    id: 'cp-112:rare#1',
    form_id: 'cp-112:rare',
    kind: 'any_of',
    set_code: 'id',
    destination: 'bali',
    poi_refs: ['editorial:tirta-empul', 'editorial:taman-ayun', 'editorial:ulun-danu-beratan'],
    geofences: [],
    n: 3,
    dwell_s: 300,
    hold_ms: null,
    window_id: null,
    solar: null,
    min_members: null,
    foreground_only: false,
    copy: 'At a water temple',
  };

  it('accepts "three water temples" as any_of', () => {
    expect(spawnRuleItemSchema.parse(rule).n).toBe(3);
  });

  it('keeps kind-specific fields on their kinds', () => {
    expect(spawnRuleItemSchema.safeParse({ ...rule, copy: 'Three water temples' }).success).toBe(
      false,
    );
    expect(spawnRuleItemSchema.safeParse({ ...rule, n: 4 }).success).toBe(false);
    expect(spawnRuleItemSchema.safeParse({ ...rule, kind: 'window' }).success).toBe(false);
    expect(
      spawnRuleItemSchema.safeParse({
        ...rule,
        geofences: [{ label: 'x', lat: 0, lng: 0, radius_m: 500 }],
      }).success,
    ).toBe(false);
  });
});

describe('places, phrases, safety and help', () => {
  const place = {
    code: 'pe',
    name: 'Peru',
    country: 'PE',
    rank: 55,
    set_group: 3,
    tz: 'America/Lima',
    currency: 'PEN',
    languages: ['es', 'qu'],
    coverage: 'live',
    guide: 'paco',
    destination: 'cusco',
    hero_critter_id: 'cp-145',
    critter_ids: ['cp-145'],
    month_hints: Array.from({ length: 12 }, () => ({ crowd: 50, note: null })),
  };

  it('checks set sizes, currencies and zones', () => {
    expect(placeIndexItemSchema.safeParse(place).success).toBe(true);
    // A set grows past its group's launch size as critters roll out, never below it.
    expect(
      placeIndexItemSchema.safeParse({ ...place, critter_ids: ['cp-145', 'cp-146'] }).success,
    ).toBe(true);
    expect(placeIndexItemSchema.safeParse({ ...place, set_group: 2 }).success).toBe(false);
    expect(
      placeIndexItemSchema.safeParse({ ...place, critter_ids: ['cp-145', 'cp-145'] }).success,
    ).toBe(false);
    expect(placeIndexItemSchema.safeParse({ ...place, currency: 'XYZ' }).success).toBe(false);
    expect(placeIndexItemSchema.safeParse({ ...place, tz: 'Mars/Olympus' }).success).toBe(false);
    expect(placeIndexItemSchema.safeParse({ ...place, guide: null }).success).toBe(false);
  });

  const card = {
    id: 'id:emergency:need-a-doctor',
    language: 'id',
    context: 'emergency',
    slug: 'need-a-doctor',
    text: 'Saya butuh dokter.',
    romanisation: null,
    gloss: 'I need a doctor.',
    audio_key: null,
    audio_status: 'pending',
    needs_native_review: true,
    native_reviewed_on: null,
  };

  it('holds emergency cards until a native speaker reviews them', () => {
    const parsed = phraseCardItemSchema.parse(card);
    expect(isPhraseCardPublishable(parsed)).toBe(false);
    expect(isPhraseCardPublishable({ ...parsed, native_reviewed_on: '2026-10-01' })).toBe(true);
    expect(phraseCardItemSchema.safeParse({ ...card, needs_native_review: false }).success).toBe(
      false,
    );
    expect(phraseCardItemSchema.safeParse({ ...card, audio_status: 'ready' }).success).toBe(false);
  });

  it('publishes safety records only once verified', () => {
    expect(isSafetyRecordPublishable({ verified_at: null })).toBe(false);
    expect(isSafetyRecordPublishable({ verified_at: at })).toBe(true);
  });

  it('flags help copy that promises holds or charges', () => {
    expect(bannedHelpPhrases('Relax, we hold your room until you pay.')).toEqual([
      'we hold your room',
    ]);
    expect(bannedHelpPhrases("Why can't I buy critters? They are found, never sold.")).toEqual([]);
  });
});
