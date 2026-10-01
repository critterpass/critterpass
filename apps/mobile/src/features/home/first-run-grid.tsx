/**
 * 3b-1 "Where to first?": the six live guides as silhouettes idling in their cells (float loops of
 * 3800–5300 ms, staggered 300 ms), each with its city chip in the guide's colour, then the dashed
 * SOMEWHERE ELSE row. Tapping a guide hops it out of its cell and grows it into the destination
 * page (once that page is registered); SOMEWHERE ELSE opens the place search the same way.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useLoop } from '@/motion/use-loop';
import { impact } from '@/motion/feedback';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
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
const FALLBACK_PLACES: Readonly<Record<GuideId, string>> = {
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
      place: row?.place ?? FALLBACK_PLACES[guide],
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
  const sticker = GUIDE_STICKERS[cell.guide];
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

export interface FirstRunGridProps {
  readonly cells: readonly GuideCell[];
  /** Content width (screen width minus gutters). */
  readonly width: number;
}

export function FirstRunGrid({ cells, width }: FirstRunGridProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const gap = theme.space['10'];
  const cellWidth = Math.floor((width - gap * (COLUMNS - 1)) / COLUMNS);
  const openSearch = () => {
    const href = homeRoutes.placeSearch();
    if (href !== undefined) router.push(href);
  };
  return (
    <View style={{ gap: theme.space['16'] }}>
      <View style={styles.grid}>
        {cells.map((cell, index) => (
          <Cell key={cell.guide} cell={cell} index={index} width={cellWidth} />
        ))}
      </View>
      <DashedRow
        testID="home-somewhere-else"
        title={upper(t({ id: 'home.firstRun.elsewhere', message: 'Somewhere else' }), locale)}
        body={t({
          id: 'home.firstRun.elsewhereBody',
          message: 'No guide there yet. Tokek will cover until one moves in.',
        })}
        mark={<Text variant="h3">+</Text>}
        onPress={openSearch}
      />
    </View>
  );
}
