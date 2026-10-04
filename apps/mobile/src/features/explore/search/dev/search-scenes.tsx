/**
 * Lab scenes for search (7d-1, 7d-2, 7d-4, 7i-2) over Bali fixtures: the empty field with a copied
 * TikTok, the iOS paste variant, typing, typing a street address (the Addresses section, also above
 * the ways out), plain words with chips (chips come off), nothing found with its ways out, and offline before and after the first bar. The words come from the screens'
 * own templates, so the lab reads in whichever language the app is in.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { SearchChip } from '@cp/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { LAB_PHOTOS } from '@/data/media/dev/lab-place-photos';
import type { PlaceCandidate } from '@/data/places/match-places';

import { AddressSection } from '../address-section';
import { BrowseGrid } from '../browse-grid';
import { ChipBlock, excludeLine } from '../chip-row';
import { ClipboardCard } from '../clipboard-card';
import { NameResults } from '../name-results';
import { NoResults } from '../no-results';
import { OfflineBanner } from '../offline-banner';
import { OfflineResults } from '../offline-results';
import { chipKey, type PlainAnswer } from '../plain-filters';
import { PlainResults } from '../plain-results';
import { SearchView } from '../search-view';
import { plainExamples, TypedExamples } from '../typed-examples';
import type { AddressesState } from '../use-addresses';
import { WorksOfflineChips } from '../works-offline-chips';
import { plainRows } from '../plain-section';
import { baliDays, header, labSearchTrip, LAB_TRIP, SAYAN_PLACES, WED } from './search-fixtures';

const noop = () => undefined;

function EmptyScene({ paste }: { readonly paste: boolean }) {
  return (
    <SearchView header={header('')} scope={null}>
      <ClipboardCard
        state={
          paste
            ? { kind: 'paste' }
            : {
                kind: 'link',
                link: {
                  url: 'https://www.tiktok.com/@balibites/video/7419000000000000000',
                  platform: 'tiktok',
                  display: 'tiktok.com/@balibites/video/7419…',
                },
                preview: {
                  title: '3 waterfalls nobody tells you about',
                  author: '@balibites',
                  thumbUrl: null,
                },
              }
        }
        onAdd={noop}
        onPasted={noop}
      />
      <TypedExamples
        examples={plainExamples({ destination: 'Bali', freeWeekday: null })}
        onAsk={noop}
        still
      />
      <BrowseGrid onBrowse={noop} />
    </SearchView>
  );
}

const typed = (
  name: string,
  source: PlaceCandidate['source'],
  category = 'food',
): PlaceCandidate => ({
  id: name,
  poiId: name,
  name,
  nameLocal: null,
  category,
  lat: null,
  lng: null,
  tags: [],
  source,
});

function TypingScene({ foursquare = false }: { readonly foursquare?: boolean }) {
  return (
    <SearchView header={header('tirta')} scope={null}>
      <NameResults
        rows={[
          typed('Tirta Empul', 'idea', 'temple_shrine'),
          typed('Tirta Gangga', 'curated', 'temple_shrine'),
          typed('Tirta Sudamala', 'server', 'nature'),
        ]}
        photos={
          new Map([
            ['Tirta Empul', foursquare ? LAB_PHOTOS.foursquare : LAB_PHOTOS.temple],
            ['Tirta Gangga', LAB_PHOTOS.generic],
          ])
        }
        state="results"
        live={{ kind: 'none' }}
        onOpen={noop}
        onAdd={noop}
        onPickLive={noop}
      />
    </SearchView>
  );
}

const ADDRESSES: AddressesState = {
  kind: 'done',
  addresses: [
    {
      line: 'Jalan Raya Sayan 70',
      rest: 'Sayan, Ubud, Gianyar, Bali 80571, Indonesia',
      lat: -8.5031,
      lng: 115.2447,
    },
    {
      line: 'Jalan Raya Sayan',
      rest: 'Kedewatan, Ubud, Gianyar, Bali 80571, Indonesia',
      lat: -8.4893,
      lng: 115.2459,
    },
  ],
  credits: [
    { label: '© Mapbox', url: 'https://www.mapbox.com/about/maps' },
    { label: '© OpenStreetMap', url: 'https://www.openstreetmap.org/about' },
  ],
};

function AddressScene() {
  return (
    <SearchView header={header('jalan raya sayan 70')} scope={null}>
      <NameResults
        rows={[typed('Sayan House', 'curated')]}
        state="results"
        live={{ kind: 'none' }}
        onOpen={noop}
        onAdd={noop}
        onPickLive={noop}
      />
      <AddressSection state={ADDRESSES} onPick={noop} />
    </SearchView>
  );
}

const CHIPS: readonly SearchChip[] = [
  { code: 'meal', params: { meal: 'dinner' } },
  { code: 'attribute', params: { attribute: 'quiet' } },
  { code: 'max_minutes', params: { from: 'stay', minutes: 15 } },
  { code: 'open_past', params: { time: '22:00' } },
  { code: 'exclude_days', params: { day_ids: [WED] } },
];

function PlainScene() {
  const [chips, setChips] = useState(CHIPS);
  const notWed = chips.some((chip) => chip.code === 'exclude_days');
  const note = notWed
    ? excludeLine(
        { code: 'day_has_meal', params: { day_ids: [WED], stable_id: LAB_TRIP.locavore } },
        baliDays(),
        new Map([[LAB_TRIP.locavore, 'Locavore']]),
      )
    : null;
  return (
    <SearchView header={header('quiet dinner near the villa, open late')} scope={null}>
      <ChipBlock
        chips={chips}
        words={{ days: baliDays(), placeName: () => null }}
        note={note}
        guide="tokek"
        guideName="Tokek"
        onRemove={(key) => setChips((all) => all.filter((chip) => chipKey(chip) !== key))}
      />
      <PlainResults
        rows={plainRows(
          notWed ? SAYAN_PLACES : [...SAYAN_PLACES.slice(0, 1), ...SAYAN_PLACES.slice(1).reverse()],
          labSearchTrip(),
        )}
        photos={
          new Map([
            ['sayan', LAB_PHOTOS.food],
            ['bridges', LAB_PHOTOS.generic],
            ['murnis', LAB_PHOTOS.food],
          ])
        }
        loading={false}
        softMisses={3}
        showingSoftMisses={false}
        onSoftMisses={noop}
        onOpen={noop}
        onAdd={noop}
        onMap={noop}
      />
    </SearchView>
  );
}

const NOTHING: PlainAnswer = {
  places: [],
  softMisses: [],
  waysOut: [
    {
      kind: 'widen',
      params: { minutes: 90 },
      count: 3,
      areas: ['Seminyak', 'Canggu'],
      openLate: null,
    },
    { kind: 'related', params: { term: 'japanese' }, count: 4, areas: ['Ubud'], openLate: 2 },
    { kind: 'pin', params: {}, count: 0, areas: [], openLate: null },
  ],
  nearest: { name: 'Sushi Ko', area: 'Seminyak', minutes: 70 },
};

function NothingScene({ addresses }: { readonly addresses: boolean }) {
  return (
    <SearchView
      header={header(addresses ? 'jalan raya sayan 70' : 'omakase sushi in ubud')}
      scope={null}
    >
      <NoResults
        answer={NOTHING}
        area="Ubud"
        limitMinutes={30}
        guide="tokek"
        guideName="Tokek"
        onWayOut={noop}
        onAsk={noop}
        addresses={addresses ? <AddressSection state={ADDRESSES} onPick={noop} /> : undefined}
      />
    </SearchView>
  );
}

function OfflineScene({ answered }: { readonly answered: boolean }) {
  return (
    <SearchView
      header={{ ...header('coffee near the terraces'), dimmed: !answered }}
      scope={null}
      banner={<OfflineBanner answered={answered} guideName="Tokek" />}
    >
      <View style={{ gap: 20 }}>
        <OfflineResults
          rows={[
            {
              key: 'b',
              title: 'Billy’s Terrace Cafe',
              category: 'food',
              meta: '4 min walk · open, as of Oct 11',
              saved: true,
            },
            {
              key: 'w',
              title: 'Warung Dapur Desa',
              category: 'food',
              meta: '9 min walk · cash only',
              saved: true,
            },
            {
              key: 'k',
              title: 'Kopi Sawah',
              category: 'food',
              meta: '12 min walk · rice field view',
              saved: true,
            },
          ]}
          photos={new Map([['b', LAB_PHOTOS.terraces]])}
          area="Jatiluwih"
          saved={14}
          curated={306}
          destination="Bali"
          syncedOn="Oct 11"
          guide="tokek"
          guideName="Tokek"
          queued={answered ? 0 : 1}
          onOpen={noop}
        />
        <WorksOfflineChips places={306} guideName="Tokek" />
      </View>
    </SearchView>
  );
}

export const SEARCH_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '7d-1': () => <EmptyScene paste={false} />,
  '7d-1-paste': () => <EmptyScene paste />,
  '7d-1-typing': () => <TypingScene />,
  '7d-1-typing-foursquare': () => <TypingScene foursquare />,
  '7d-1-addresses': () => <AddressScene />,
  '7d-2': () => <PlainScene />,
  '7d-4': () => <NothingScene addresses={false} />,
  '7d-4-addresses': () => <NothingScene addresses />,
  '7i-2': () => <OfflineScene answered={false} />,
  '7i-2-back-online': () => <OfflineScene answered />,
};
