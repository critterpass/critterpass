/**
 * Lab scenes for where to find a form (undesigned): Tokek's rare form with three temples on the
 * map, nearest first, and its steps; the legendary with its day and the crew it needs and no place
 * to send anyone; NEAR ME's map of Bali's critter places.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Scaffold } from '@/ui/surface/Scaffold';
import { useTheme } from '@/ui/theme';

import { SpotMap } from '../where/spot-map';
import type { FormWhere } from '../where/where-model';
import { WhereView } from '../where/where-view';

const TOKEK = { key: 'cp-112', seed: 7, city: 'Bali' };
const UBUD = { lat: -8.5069, lng: 115.2625 };
const spot = (key: string, name: string, lat: number, lng: number, distanceM: number) => ({
  key,
  name,
  lat,
  lng,
  radiusM: 50,
  distanceM,
});

const RARE: FormWhere = {
  formId: 'cp-112-rare',
  critterId: 'cp-112',
  rarity: 'rare',
  spots: [
    spot('tirta', 'Tirta Empul', -8.4152, 115.3153, 11_200),
    spot('ulun', 'Pura Ulun Danu Beratan', -8.2752, 115.1668, 27_400),
    spot('taman', 'Pura Taman Ayun', -8.5418, 115.1726, 10_600),
  ].sort((a, b) => a.distanceM - b.distanceM),
  steps: [
    { kind: 'places', n: 3 },
    { kind: 'stay', minutes: 10 },
  ],
  nearest: spot('taman', 'Pura Taman Ayun', -8.5418, 115.1726, 10_600),
};

const LEGENDARY: FormWhere = {
  formId: 'cp-112-legendary',
  critterId: 'cp-112',
  rarity: 'legendary',
  spots: [],
  steps: [
    { kind: 'day', placeLine: 'Bali · all six on Batur by sunrise', challenge: null },
    { kind: 'together', members: 6 },
  ],
  nearest: null,
};

function Where({
  where,
  requirement,
}: {
  readonly where: FormWhere;
  readonly requirement: string;
}) {
  return (
    <WhereView
      where={where}
      tier={where.rarity}
      requirement={requirement}
      critter={TOKEK}
      slug="bali"
      position={UBUD}
      away={where.nearest === null ? null : '10.6 km'}
      onDirections={() => undefined}
    />
  );
}

function NearMapScene({ noPack = false }: { readonly noPack?: boolean }) {
  const theme = useTheme();
  return (
    <Scaffold variant="dark" edges={['top']} testID="critters-near-map-scene">
      <ScrollView contentContainerStyle={{ padding: theme.size.gutter }}>
        <SpotMap
          spots={[
            { ...spot('tirta', 'Tirta Empul', -8.4152, 115.3153, 0), tier: 'rare' },
            { ...spot('batur', 'Batur summit', -8.2422, 115.375, 0), tier: 'epic' },
            { ...spot('monkey', 'Monkey Forest', -8.5188, 115.2585, 0), tier: null },
          ]}
          position={UBUD}
          // Without a pack: a slug the tiles host has never heard of.
          slug={noPack ? 'lab-no-region-pack' : 'bali'}
          placeName="Bali"
          foundLabel="All found"
          height={320}
          testID="critters-near-map"
        />
      </ScrollView>
    </Scaffold>
  );
}

export const WHERE_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3l-3-where-rare': () => <Where where={RARE} requirement="Three water temples" />,
  '3l-3-where-legendary': () => <Where where={LEGENDARY} requirement="All six at the top" />,
  '3l-2-near-map': () => <NearMapScene />,
  'near-map-no-pack': () => <NearMapScene noPack />,
};
