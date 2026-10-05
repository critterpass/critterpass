import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { loadRelease, type ContentItem } from '@cp/content';
import { describe, expect, it } from 'vitest';

import {
  correctionItems,
  loadCorrections,
  type BeforeRow,
  type PlaceCorrection,
} from '../src/kinds/places/corrections';
import { correctionCounts } from '../src/kinds/places/corrections-counts';
import { batchItems, hiddenItems } from '../src/kinds/places/corrections-hidden';
import { outOfReach, withNewRecords } from '../src/kinds/places/corrections-new-records';
import { placesKind } from '../src/kinds/places/pois';
import { runValidators } from '../src/validators/registry';
import { FACTORY_DIR, readJson } from '../src/work';

const liveItem = (
  ref: string,
  over: Partial<ContentItem<'places'>> = {},
): ContentItem<'places'> => ({
  ref,
  destination: 'bali',
  name: 'Tirta Empul Holy Water Temple',
  name_local: null,
  category: 'other',
  lat: -8.41544,
  lng: 115.31541,
  address: 'Manukaya, Tampaksiring',
  tz: 'Asia/Makassar',
  tags: ['temples', 'culture'],
  hours: null,
  licence: {
    source: 'overture',
    source_id: ref.slice('overture:'.length),
    licence: 'CDLA-Permissive-2.0',
    attribution: 'Overture Maps Foundation',
  },
  editorial: {
    why_go: 'A holy spring temple.',
    best_time: 'Early morning',
    time_needed_min: 90,
    crowd_hint: 'Busy by mid-morning',
    etiquette: 'Wear a sarong.',
  },
  merge_into: null,
  possible_duplicate_of: null,
  ...over,
});

const row = (ref: string, over: Partial<BeforeRow> = {}): BeforeRow => ({
  id: '01a0edd6-8e8c-741d-8092-70191ed916e5',
  ref,
  destination: 'bali',
  name: 'Tirta Empul Holy Water Temple',
  name_local: null,
  category: 'other',
  lat: -8.41544,
  lng: 115.31541,
  address: 'Manukaya, Tampaksiring',
  tz: null,
  curated: true,
  must_see: false,
  essential: false,
  trip_refs: 0,
  merged_into: null,
  item: liveItem(ref),
  ...over,
});

const place = (over: Partial<PlaceCorrection> = {}): PlaceCorrection => ({
  destination: 'bali',
  keep: 'overture:kept',
  stored_name: 'Tirta Empul Holy Water Temple',
  stated: true,
  why: 'The record at the temple.',
  checked: { source: 'OpenStreetMap way 1', lat: -8.4144, lng: 115.3162, off_m: 149 },
  merge: [],
  ...over,
});

const note = {
  why_go: 'A holy spring temple at Tampaksiring.',
  best_time: 'Early morning',
  time_needed_min: 90,
  crowd_hint: 'Busy by mid-morning',
  etiquette: null,
  tags: ['temples' as const],
};

describe('place corrections', () => {
  it('restates the kept record with the corrected name, kind and must-see flag only', () => {
    const [item] = correctionItems(
      [
        place({
          name: 'Tirta Empul Temple',
          name_local: 'Pura Tirta Empul',
          category: 'temple_shrine',
          must_see: true,
        }),
      ],
      [row('overture:kept')],
    );
    expect(item).toEqual({
      ...liveItem('overture:kept'),
      name: 'Tirta Empul Temple',
      name_local: 'Pura Tirta Empul',
      category: 'temple_shrine',
      editorial: { ...liveItem('overture:kept').editorial, must_see: true },
    });
  });

  it('leaves the must-see flag unstated where the correction does not set it', () => {
    const [item] = correctionItems([place({ category: 'temple_shrine' })], [row('overture:kept')]);
    expect(item?.editorial).not.toHaveProperty('must_see');
  });

  it('redirects a duplicate to the kept record and files it under the kept kind', () => {
    const items = correctionItems(
      [
        place({
          category: 'temple_shrine',
          merge: [
            { ref: 'overture:far', stored_name: 'Tirta Empul' },
            { ref: 'fsq_os:unseen', stored_name: 'Pura Tirta Empul' },
          ],
        }),
      ],
      [
        row('overture:kept'),
        row('overture:far', {
          name: 'Tirta Empul',
          lat: -8.54766,
          must_see: true,
          item: liveItem('overture:far', {
            name: 'Tirta Empul',
            editorial: { ...liveItem('overture:far').editorial, must_see: true },
          }),
        }),
        // Never in a release: it borrows the kept record's note and takes its own source's licence.
        row('fsq_os:unseen', { name: 'Pura Tirta Empul', curated: false, item: null }),
      ],
    );
    expect(items.map((item) => [item.ref, item.merge_into, item.category])).toEqual([
      ['overture:kept', null, 'temple_shrine'],
      ['overture:far', 'overture:kept', 'temple_shrine'],
      ['fsq_os:unseen', 'overture:kept', 'temple_shrine'],
    ]);
    // A merged record no longer leads the first-timer picks.
    expect(items[1]?.editorial.must_see).toBe(false);
    expect(items[2]).toMatchObject({
      name: 'Pura Tirta Empul',
      tz: 'Asia/Makassar',
      licence: { source: 'fsq_os', source_id: 'unseen', licence: 'Apache-2.0' },
      editorial: { why_go: 'A holy spring temple.' },
    });
  });

  it('sets the essential tier with the must-see flag and takes both off a merged record', () => {
    const items = correctionItems(
      [
        place({
          must_see: true,
          essential: true,
          merge: [{ ref: 'overture:far', stored_name: 'Tirta Empul' }],
        }),
      ],
      [
        row('overture:kept'),
        row('overture:far', {
          must_see: true,
          essential: true,
          item: liveItem('overture:far', {
            editorial: { ...liveItem('overture:far').editorial, must_see: true, essential: true },
          }),
        }),
      ],
    );
    expect(items[0]?.editorial).toMatchObject({ must_see: true, essential: true });
    expect(items[1]?.editorial).toMatchObject({ must_see: false, essential: false });
    // A kept record whose correction says nothing of the tier leaves it unstated.
    const [plain] = correctionItems([place({ must_see: true })], [row('overture:kept')]);
    expect(plain?.editorial).not.toHaveProperty('essential');
  });

  it('replaces only the revised lines of a note, and gives a merged record the kept note on request', () => {
    const items = correctionItems(
      [
        place({
          revise: { why_go: 'A holy spring temple at Tampaksiring.' },
          merge: [{ ref: 'overture:far', stored_name: 'Tirta Empul', kept_note: true }],
        }),
      ],
      [
        row('overture:kept'),
        row('overture:far', {
          item: liveItem('overture:far', {
            tags: ['history'],
            editorial: { ...liveItem('overture:far').editorial, why_go: 'A 10th-century temple.' },
          }),
        }),
      ],
    );
    expect(items[0]?.editorial).toEqual({
      ...liveItem('overture:kept').editorial,
      why_go: 'A holy spring temple at Tampaksiring.',
    });
    expect(items[1]).toMatchObject({
      ref: 'overture:far',
      merge_into: 'overture:kept',
      tags: ['temples', 'culture'],
      editorial: { why_go: 'A holy spring temple at Tampaksiring.' },
    });
  });

  it('restates a hidden record with hide and without its flags, and refuses one a trip points at', () => {
    const flagged = liveItem('overture:far', {
      editorial: { ...liveItem('overture:far').editorial, must_see: true, essential: true },
    });
    const hidden = [
      {
        destination: 'bali',
        ref: 'overture:far',
        stored_name: 'Tirta Empul',
        why: 'Pinned in Kuta.',
      },
    ];
    const [item] = hiddenItems(hidden, [row('overture:far', { item: flagged })], new Set());
    expect(item).toMatchObject({ ref: 'overture:far', hide: true, merge_into: null });
    expect(item?.editorial).toEqual(liveItem('overture:far').editorial);
    expect(() =>
      hiddenItems(hidden, [row('overture:far', { item: flagged, trip_refs: 2 })], new Set()),
    ).toThrow(/2 trip stops/u);
    // Not both corrected and hidden, and only a record the live release states.
    expect(() => hiddenItems(hidden, [row('overture:far')], new Set(['overture:far']))).toThrow(
      /twice/u,
    );
    expect(() => hiddenItems(hidden, [row('overture:far', { item: null })], new Set())).toThrow(
      /no live item/u,
    );
  });

  it('builds the item of a record that joins the recommended set from its note', () => {
    const before = [row('overture:kept', { curated: false, item: null })];
    expect(() => correctionItems([place()], before)).toThrow(/needs a note/u);
    const [item] = correctionItems([place({ note, must_see: true })], before);
    expect(item).toMatchObject({
      ref: 'overture:kept',
      tags: ['temples'],
      hours: null,
      editorial: { why_go: note.why_go, must_see: true },
      licence: { source: 'overture', source_id: 'kept' },
    });
  });

  it('states only the duplicates of a kept record that stays outside the recommended set', () => {
    const items = correctionItems(
      [
        place({
          stated: false,
          note,
          merge: [{ ref: 'overture:far', stored_name: 'Tirta Empul' }],
        }),
      ],
      [row('overture:kept', { curated: false, item: null }), row('overture:far')],
    );
    expect(items.map((item) => [item.ref, item.merge_into])).toEqual([
      ['overture:far', 'overture:kept'],
    ]);
  });

  it('refuses a record that is unknown, corrected twice, or both kept and merged', () => {
    const before = [row('overture:kept'), row('overture:far')];
    const merge = [{ ref: 'overture:far', stored_name: 'Tirta Empul' }];
    expect(() => correctionItems([place({ keep: 'overture:gone' })], before)).toThrow(/snapshot/u);
    expect(() =>
      correctionItems([place({ merge }), place({ keep: 'overture:far' })], before),
    ).toThrow(/twice|kept and merged/u);
    expect(() => correctionItems([place({ merge: [...merge, ...merge] })], before)).toThrow(
      /twice/u,
    );
    expect(() =>
      correctionItems([place()], [row('overture:kept', { merged_into: 'overture:far' })]),
    ).toThrow(/redirects/u);
    expect(() =>
      correctionItems([place()], [row('overture:kept', { destination: 'da-nang' })]),
    ).toThrow(/da-nang/u);
  });

  it('counts a recommended record over 2 km from the kept one as a moved point', () => {
    const counts = correctionCounts(
      [
        place({
          category: 'temple_shrine',
          must_see: true,
          merge: [{ ref: 'overture:far', stored_name: 'Tirta Empul' }],
        }),
      ],
      [row('overture:kept'), row('overture:far', { lat: -8.54766, lng: 115.27327 })],
    );
    expect(counts).toMatchObject({
      merges: 1,
      recommendedMerges: 1,
      kindChanges: 1,
      movedPoints: 1,
      mustSees: 1,
      added: 0,
    });
  });
});

describe('committed corrections batches', () => {
  const dir = path.join(FACTORY_DIR, 'src', 'data', 'place-corrections');
  const batches = existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith('.before.json'))
        .map((file) => file.slice(0, -'.before.json'.length))
    : [];

  it.each(batches)(
    '%s is what its decisions and snapshot build, and passes the validators',
    (batchKey) => {
      const { file, before } = loadCorrections(batchKey);
      const items = batchItems(file, before);
      const artifact = loadRelease(
        readJson<unknown>(path.join(FACTORY_DIR, 'batches', 'places', `${batchKey}.json`)),
        'places',
      );
      expect(artifact.items).toEqual(items);
      expect(outOfReach(file.new_records)).toEqual([]);
      expect(runValidators('places', items, placesKind.validators).counts.fail).toBe(0);
      // Every must-see is a record the batch leaves visible.
      for (const item of items.filter((poi) => poi.editorial.must_see === true)) {
        expect(item.merge_into).toBeNull();
      }
    },
  );
});

describe('a place the catalogue does not hold yet', () => {
  const lagoon = {
    destination: 'iceland',
    ref: 'overture:1f85bbe3-eb4a-4009-b165-a34704a51610',
    name: 'Blue Lagoon',
    name_local: 'Bláa lónið',
    category: 'nature' as const,
    lat: 63.88038,
    lng: -22.44756,
    address: null,
  };
  const place: PlaceCorrection = {
    destination: 'iceland',
    keep: lagoon.ref,
    stored_name: 'Blue Lagoon',
    stated: true,
    must_see: true,
    essential: true,
    note: {
      why_go: 'A geothermal lagoon in a lava field.',
      best_time: 'First slot of the day',
      time_needed_min: 180,
      crowd_hint: 'Timed tickets sell out',
      etiquette: null,
      tags: ['wellness'],
    },
    why: 'The box now reaches it.',
    checked: { source: 'OpenStreetMap way 69991144', lat: 63.88005, lng: -22.44935, off_m: 95 },
    merge: [],
  };

  it('is created at its stated point, under the id the ingest will store it by', () => {
    const [item] = correctionItems([place], withNewRecords([], [lagoon]));
    expect(item).toMatchObject({
      ref: lagoon.ref,
      destination: 'iceland',
      name: 'Blue Lagoon',
      name_local: 'Bláa lónið',
      category: 'nature',
      lat: 63.88038,
      lng: -22.44756,
      tz: 'Atlantic/Reykjavik',
      licence: { source: 'overture', source_id: '1f85bbe3-eb4a-4009-b165-a34704a51610' },
      editorial: { must_see: true, essential: true, time_needed_min: 180 },
      merge_into: null,
    });
  });

  it('gives way to the stored record once the ingest has created it', () => {
    const stored = row(lagoon.ref, {
      destination: 'iceland',
      name: 'Blue Lagoon Iceland',
      lat: 63.8801,
      lng: -22.4491,
      tz: 'Atlantic/Reykjavik',
      curated: false,
      must_see: false,
      item: null,
    });
    const before = withNewRecords([stored], [lagoon]);
    expect(before).toEqual([stored]);
    expect(correctionItems([{ ...place, name: 'Blue Lagoon' }], before)[0]).toMatchObject({
      name: 'Blue Lagoon',
      lat: 63.8801,
      lng: -22.4491,
    });
  });

  it('is refused beyond the map pack and routing area of its destination', () => {
    expect(outOfReach([lagoon])).toEqual([]);
    expect(
      outOfReach([
        { ...lagoon, destination: 'cusco', name: 'Machu Picchu', lat: -13.1631, lng: -72.545 },
      ]),
    ).toEqual(["Machu Picchu lies 27 km outside cusco's map pack and routing area"]);
  });
});
