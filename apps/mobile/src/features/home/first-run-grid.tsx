/**
 * 3b-1 "Where to first?": the place search first (most first trips are to a place the six guides
 * don't live in), then the places in the traveller's own country, then the six live guides as
 * silhouettes idling in their cells (float loops of 3800–5300 ms, staggered 300 ms), each with its
 * city chip in the guide's colour. Tapping a guide hops it out of its cell and grows it into the
 * destination page (once that page is registered); a place near home opens the same page.
 */
import { tokens } from '@cp/design-tokens';
import { toCountryCode } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { impact } from '@/motion/feedback';
import { useGuidesPerCity } from '@/data/guides';
import { guideSticker } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { useSharedSource, zoomTo } from '@/ui/transitions/use-shared-source';

import { DashedRow } from './dashed-row';
import type { GuideCellRow } from './data/home-queries';
import { guideColour } from './format';
import { homeRoutes } from './routes';

const CELL_HEIGHT = 132;
const CELL_STICKER = 88;
const COLUMNS = 3;
/** The render's flat grey guide silhouettes on the raised cell. */
const SILHOUETTE = tokens.color.ink[400];

/** The guides' home cities before the catalogue has synced (place names are data, not copy). */
/* eslint-disable lingui/no-unlocalized-strings -- proper nouns from the content catalogue. */
const FALLBACK_PLACES: Readonly<Record<string, string>> = {
  tokek: 'Bali',
  pon: 'Kyoto',
  lundi: 'Iceland',
  ajo: 'Mexico City',
  sardi: 'Lisbon',
  paco: 'Cusco',
  chava: 'Đà Nẵng',
};
/* eslint-enable lingui/no-unlocalized-strings */

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['10'] },
  cell: {
    height: CELL_HEIGHT,
    borderRadius: t.radius.cardBig,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: t.space['12'],
    paddingBottom: t.space['16'],
  },
  chip: {
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['2'],
    borderRadius: t.radius.sm,
  },
}));

export interface GuideCell {
  readonly guide: GuideId;
  readonly place: string;
  readonly placeId: string | null;
}

/** The six cells in guide order, named from the synced catalogue where it has them. */
export function guideCells(rows: readonly GuideCellRow[]): GuideCell[] {
  return tokens.guide.order.map((guide) => {
    const row = rows.find((candidate) => candidate.guide_slug === guide);
    return {
      guide,
      place: row?.place ?? FALLBACK_PLACES[guide] ?? '',
      placeId: row?.destination_id ?? null,
    };
  });
}

function Cell({ cell, index, width }: { cell: GuideCell; index: number; width: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const float = useLoop('float', { offset: index / 6 });
  const sticker = guideSticker(cell.guide);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a shared-element id, never copy.
  const sourceId = `guide-cell-${cell.guide}`;
  const face = () => (
    <Sticker
      kind={sticker.kind}
      name={sticker.name}
      size={CELL_STICKER}
      variant="mask"
      maskColor={SILHOUETTE}
      sticker={null}
    />
  );
  const ref = useSharedSource(sourceId, face);
  const open = () => {
    impact('pop');
    const href = cell.placeId === null ? undefined : homeRoutes.destination(cell.placeId);
    if (href !== undefined) void zoomTo(sourceId, href, { hop: true });
  };
  return (
    <Pressable
      testID={`home-guide-${cell.guide}`}
      accessibilityRole="button"
      accessibilityLabel={t({
        id: 'home.firstRun.guideCell',
        message: `${cell.place}, with ${sticker.name}`,
      })}
      onPress={open}
      style={[styles.cell, { width }]}
    >
      <Animated.View ref={ref} style={float}>
        {face()}
      </Animated.View>
      <View style={[styles.chip, { backgroundColor: guideColour(cell.guide) }]}>
        <Text variant="label" color={theme.semantic.text.onAccent} numberOfLines={1}>
          {upper(cell.place, locale)}
        </Text>
      </View>
    </Pressable>
  );
}

export interface NearHomePlace {
  readonly id: string;
  readonly name: string;
}

/** How many places near home the first run offers before the guides. */
const NEAR_HOME_MAX = 12;

/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
const NEAR_HOME_SQL = `SELECT d.id, d.name, d.country, d.coverage,
    (SELECT home_country FROM users WHERE id = ?) AS home
  FROM destinations d ORDER BY d.name`;
const NEAR_HOME_TABLES = ['destinations', 'users'];
/* eslint-enable lingui/no-unlocalized-strings */

export interface DestinationRow extends NearHomePlace {
  readonly country: string | null;
  readonly coverage: string | null;
  readonly home: string | null;
}

/**
 * The catalogue's places in the traveller's home country (the catalogue writes countries by name,
 * the account by code: both are read as codes), places with a live guide first, a handful at most.
 */
export function nearHomePlaces(rows: readonly DestinationRow[]): NearHomePlace[] {
  const home = toCountryCode(rows[0]?.home ?? null);
  if (home === null) return [];
  const live = (row: DestinationRow) => (row.coverage === 'live' ? 0 : 1);
  return rows
    .filter((row) => toCountryCode(row.country) === home)
    .sort((a, b) => live(a) - live(b))
    .slice(0, NEAR_HOME_MAX)
    .map((row) => ({ id: row.id, name: row.name }));
}

/** The destinations in the traveller's home country, from the synced catalogue. */
export function useNearHomePlaces(uid: string | null): readonly NearHomePlace[] {
  const db = useContext(LocalFirstContext)?.db ?? null;
  const [places, setPlaces] = useState<readonly NearHomePlace[]>([]);
  useEffect(() => {
    if (db === null || uid === null) return undefined;
    const controller = new AbortController();
    const load = () =>
      db.getAll<DestinationRow>(NEAR_HOME_SQL, [uid]).then(
        (rows) => {
          if (!controller.signal.aborted) setPlaces(nearHomePlaces(rows));
        },
        () => undefined,
      );
    void load();
    db.onChange(
      { onChange: () => load() },
      { tables: NEAR_HOME_TABLES, throttleMs: 30, signal: controller.signal },
    );
    return () => controller.abort();
  }, [db, uid]);
  return places;
}

function NearHome({ places }: { readonly places: readonly NearHomePlace[] }) {
  const { t } = useLingui();
  const locale = useLocale();
  const theme = useTheme();
  if (places.length === 0) return null;
  return (
    <View style={{ gap: theme.space['8'] }} testID="home-near-home">
      <Text variant="eyebrow">
        {upper(t({ id: 'home.firstRun.nearHome', message: 'Close to home' }), locale)}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space['8'] }}>
        {places.map((place) => (
          <InlineAction
            key={place.id}
            kind="choice"
            label={upper(place.name, locale)}
            onPress={() => {
              const href = homeRoutes.destination(place.id);
              if (href !== undefined) router.push(href);
            }}
            testID={`home-near-${place.id}`}
          />
        ))}
      </View>
    </View>
  );
}

export interface FirstRunGridProps {
  readonly cells: readonly GuideCell[];
  /** Content width (screen width minus gutters). */
  readonly width: number;
  /** The signed-in user, whose home country picks the places offered first. */
  readonly uid?: string | null;
}

export function FirstRunGrid({ cells, width, uid = null }: FirstRunGridProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const perCity = useGuidesPerCity();
  const gap = theme.space['10'];
  const cellWidth = Math.floor((width - gap * (COLUMNS - 1)) / COLUMNS);
  const openSearch = () => {
    const href = homeRoutes.placeSearch();
    if (href !== undefined) router.push(href);
  };
  const nearHome = useNearHomePlaces(uid);
  return (
    <View style={{ gap: theme.space['16'] }}>
      <DashedRow
        testID="home-somewhere-else"
        title={upper(t({ id: 'home.firstRun.search', message: 'Search a place' }), locale)}
        body={
          perCity
            ? t({
                id: 'home.firstRun.searchBody',
                message: 'Any city or region. A guide comes along wherever you go.',
              })
            : t({
                id: 'home.firstRun.elsewhereBody',
                message: 'No guide there yet. Tokek will cover until one moves in.',
              })
        }
        mark={<Text variant="h3">+</Text>}
        onPress={openSearch}
      />
      <NearHome places={nearHome} />
      <View style={styles.grid}>
        {cells.map((cell, index) => (
          <Cell key={cell.guide} cell={cell} index={index} width={cellWidth} />
        ))}
      </View>
    </View>
  );
}
