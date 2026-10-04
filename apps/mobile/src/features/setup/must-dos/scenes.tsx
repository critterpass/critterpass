/**
 * Fixed must-dos scenes (developer tools and device screenshots): the list as the render shows it
 * (3c-7, with truthful lottery wording), the add sheet mid-search (3c-10) and the states around
 * them, each the real view over the Kyoto six with no database or network.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture data and scene ids, never copy. */
import type { TripSetupStep } from '@cp/domain';
import type { ReactNode } from 'react';

import { ALEX, DEV, JORDAN, kyotoTrip, MAYA, RIN, sceneFrame, WINSTON } from '../scenes/fixtures';
import { exitScene, type SetupScene } from '../scenes/types';
import { AddSheetView } from './add-sheet-view';
import { buildMustDos, type MustDoRow } from './model';
import { MorePlacesSection } from './more-places-section';
import type { LivePlace } from './more-places';
import { MustDosView } from './must-dos-view';
import type { PlaceResult, SearchState } from './search';

function row(
  id: string,
  owner: string,
  title: string,
  sub: string,
  extra: Partial<MustDoRow> = {},
): MustDoRow {
  return {
    id: `0199a6f0-0000-7000-8000-0000000d00${id}`,
    owner_id: owner,
    title,
    poi_id: null,
    priority: 0,
    co_owner_ids: null,
    fit_status: 'fits',
    fit_note: null,
    target_day: null,
    external_action: 'none',
    external_deadline: null,
    place_address: sub,
    ...extra,
  };
}

const FIVE: readonly MustDoRow[] = [
  row('01', MAYA, 'Tea ceremony', 'Camellia, Gion'),
  row('02', ALEX, 'Nintendo Museum', 'Uji · ticket lottery', {
    external_action: 'lottery',
    external_deadline: '2027-02-10',
  }),
  row('03', JORDAN, 'Vegetarian kaiseki', 'Shigetsu, Arashiyama'),
  row('04', RIN, 'Arashiyama at dawn', 'Bamboo grove, 6am'),
  row('05', WINSTON, 'Pontocho at night', 'Alley dinner, river side'),
];

function listScene(
  name: string,
  rows: readonly MustDoRow[],
  options: { typing?: string[]; me?: string; step?: TripSetupStep } = {},
): SetupScene {
  return {
    name,
    render: () => {
      const trip = kyotoTrip({
        step: options.step ?? 'must_dos',
        dates: true,
        ...(options.me === undefined ? {} : { me: options.me }),
      });
      const model = buildMustDos(rows, null, trip.members, trip.me, options.typing ?? []);
      return (
        <MustDosView
          trip={trip}
          shell={sceneFrame(trip, 'must_dos')}
          model={model}
          canAdd
          onAdd={() => undefined}
          onDraft={() => undefined}
          onRemove={() => undefined}
          onRemind={() => undefined}
        />
      );
    },
  };
}

const RAMEN: readonly PlaceResult[] = [
  {
    id: 'ramen-koji',
    name: 'Ramen Kōji',
    blurb: 'Ten shops on one floor of Kyoto Station',
    pill: { kind: 'fits', day: null },
  },
  {
    id: 'menbaka',
    name: 'Menbaka Fire Ramen',
    blurb: 'They set the bowl on fire. Seats go fast.',
    pill: { kind: 'book_ahead', by: null },
  },
];

function sheetScene(
  name: string,
  query: string,
  search: SearchState,
  more?: ReactNode,
): SetupScene {
  return {
    name,
    render: () => {
      const trip = kyotoTrip({ step: 'must_dos', dates: true, me: DEV });
      const me = trip.members.find((member) => member.uid === DEV) ?? trip.members[0];
      if (me === undefined) return null;
      return (
        <AddSheetView
          trip={trip}
          me={me}
          query={query}
          search={search}
          onQuery={() => undefined}
          onPickPlace={() => undefined}
          onKeepText={() => undefined}
          onDismiss={exitScene}
          more={more}
        />
      );
    },
  };
}

/** Live results the guide's own search did not have (display-only Foursquare results). */
const KODAI: readonly LivePlace[] = [
  {
    fsqPlaceId: '4b0588c1f964a5203a8e22e3',
    poiId: null,
    name: 'Kōdai-ji',
    address: 'Shimokawara-chō, Higashiyama-ku',
  },
  { fsqPlaceId: '5a1b2c3d4e5f60718293a4b5', poiId: null, name: 'Kodai Tea Stand', address: null },
];

const ONE_TEMPLE: SearchState = {
  kind: 'done',
  offline: false,
  results: [
    { id: 'kodaiji-garden', name: 'Kōdai-ji Garden', blurb: 'Lit up in autumn', pill: null },
  ],
};

function more(note: 'unavailable' | null): ReactNode {
  return (
    <MorePlacesSection
      state={{ kind: 'done', places: KODAI }}
      note={note === null ? null : { fsqPlaceId: '5a1b2c3d4e5f60718293a4b5', kind: note }}
      destinationName="Kyoto"
      onPick={() => undefined}
    />
  );
}

export const MUST_DOS_SCENES: readonly SetupScene[] = [
  listScene('3c-7-must-dos', FIVE, { typing: [DEV] }),
  sheetScene('3c-10-add-must-do', 'ramen cr', { kind: 'done', results: RAMEN, offline: false }),
  listScene('must-dos-empty', []),
  listScene('must-dos-member', FIVE.slice(0, 3), { me: RIN, typing: [DEV] }),
  listScene('must-dos-clash', [
    ...FIVE.slice(0, 2),
    row('06', RIN, 'Philosopher’s Path at night', 'Closed after dark on your dates', {
      fit_status: 'clash',
    }),
    row('07', JORDAN, 'Kiyomizu-dera', 'Only a short window on day 3', { fit_status: 'tight' }),
  ]),
  listScene('must-dos-lottery', [FIVE[1] as MustDoRow, FIVE[0] as MustDoRow]),
  listScene('must-dos-duplicate', [
    row('01', MAYA, 'Tea ceremony', 'Camellia, Gion', { co_owner_ids: `["${JORDAN}"]` }),
    ...FIVE.slice(3),
  ]),
  listScene('must-dos-done', FIVE, { step: 'done' }),
  sheetScene('add-must-do-loading', 'ramen', { kind: 'loading' }),
  sheetScene('add-must-do-many', 'fushimi inari at sunrise', {
    kind: 'done',
    offline: false,
    results: [
      {
        id: 'fushimi-inari',
        name: 'Fushimi Inari Taisha',
        blurb: 'Ten thousand gates up the mountain',
        pill: { kind: 'fits', day: null },
      },
      {
        id: 'oinari-pudding',
        name: 'Oinari Pudding Fushimi Inari',
        blurb: 'Fox-shaped custard by the station',
        pill: null,
      },
      {
        id: 'inari-sushi',
        name: 'Inari Sushi Koshou',
        blurb: 'Tofu-pocket sushi near the first gate',
        pill: null,
      },
    ],
  }),
  sheetScene('add-must-do-no-results', 'yakitori alley zz', {
    kind: 'done',
    results: [],
    offline: false,
  }),
  sheetScene('add-must-do-offline', 'ramen crawl', { kind: 'done', results: [], offline: true }),
  sheetScene('add-must-do-closed', 'temple', {
    kind: 'done',
    offline: false,
    results: [
      {
        id: 'kinkakuji',
        name: 'Kinkaku-ji',
        blurb: 'The golden pavilion',
        pill: { kind: 'fits', day: null },
      },
      {
        id: 'shugakuin',
        name: 'Shūgaku-in Imperial Villa',
        blurb: 'Closed every day of your trip',
        pill: { kind: 'clash' },
      },
    ],
  }),
  sheetScene('add-must-do-more-places', 'kodai', ONE_TEMPLE, more(null)),
  sheetScene('add-must-do-more-unsaved', 'kodai', ONE_TEMPLE, more('unavailable')),
];
