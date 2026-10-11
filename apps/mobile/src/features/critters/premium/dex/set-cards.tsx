/**
 * The dex's set cards (8.01): the legendary-on-your-dates banner on ink, the home set's card with
 * its grid of found stickers and grey silhouettes, and a country row with its rank, count and five
 * cells. Each opens its set (the banner the legendary calendar).
 */
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Icon, PressableScale, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import { artKind } from '../../art-kind';
import { spanLabel } from '../../critters-copy';
import {
  homeSetCount,
  legendaryEyebrow,
  legendaryTitle,
  rankNumber,
  setCount,
} from '../../dex/dex-copy';
import type { LegendaryOnDates, SetModel } from '../../dex/dex-model';
import { CritterSilhouette } from '../components/critter-silhouette';
import { CellArt } from './dex-cells';

const useStyles = makePremiumStyles((th) => ({
  banner: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap12,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: th.color.inkSurface,
  },
  home: {
    padding: 14,
    gap: th.space.gap12,
    borderRadius: 24,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  cell: { width: '20%', height: 50, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space.gap10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  cells: { flexDirection: 'row', gap: 2 },
  rowCell: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
}));

export function LegendaryBanner({
  legendary,
  onPress,
}: {
  readonly legendary: LegendaryOnDates;
  readonly onPress: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const locale = useLocale();
  const title = legendaryTitle(
    legendary.placeLine,
    spanLabel(legendary.start, legendary.end, locale),
  );
  return (
    <PressableScale
      style={styles.banner}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${legendaryEyebrow()}. ${title}`}
      testID="critters-legendary-banner"
    >
      {legendary.critterKey === null ? null : (
        <CritterSilhouette
          kind={artKind(legendary.critterKey)}
          label={legendary.placeLine}
          size={48}
          rarity="legendary"
          seed={legendary.critterSeed}
          onInk
          markColor={th.accent.sun}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text variant="tier" color={th.accent.sun}>
          {legendaryEyebrow().toLocaleUpperCase(locale)}
        </Text>
        <Text variant="rowTitle" color={th.color.onInkSurface} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Icon name="forward" size={14} color={th.color.onInkSurface} />
    </PressableScale>
  );
}

export function HomeSetCard({
  set,
  onOpen,
}: {
  readonly set: SetModel;
  readonly onOpen: (setId: string) => void;
}) {
  const styles = useStyles();
  const count = homeSetCount(set.found, set.total);
  return (
    <PressableScale
      style={styles.home}
      onPress={() => onOpen(set.id)}
      accessibilityRole="button"
      accessibilityLabel={`${set.name}, ${count}`}
      testID="critters-home-set"
    >
      <View>
        <Text variant="headline">{set.name}</Text>
        <Text variant="captionMuted" tone="muted">
          {count}
        </Text>
      </View>
      <View style={styles.grid}>
        {set.cells.map((cell) => (
          <View key={cell.id} style={styles.cell} testID={`critters-cell-${cell.no}`}>
            <CellArt cell={cell} size={46} maskSize={42} />
          </View>
        ))}
      </View>
    </PressableScale>
  );
}

export function PlaceRow({
  set,
  onOpen,
}: {
  readonly set: SetModel;
  readonly onOpen: (setId: string) => void;
}) {
  const styles = useStyles();
  const count = setCount(set.found, set.total);
  return (
    <PressableScale
      style={styles.row}
      onPress={() => onOpen(set.id)}
      accessibilityRole="button"
      accessibilityLabel={`${set.name}, ${count}`}
      testID={`critters-set-${set.rank ?? set.country}`}
    >
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {set.rank === null ? null : (
            <Text variant="rowTitle" tone="placeholder">{`${rankNumber(set.rank)} `}</Text>
          )}
          {set.name}
        </Text>
        <Text variant="captionMuted" tone="muted">
          {count}
        </Text>
      </View>
      <View style={styles.cells}>
        {set.cells.slice(0, 5).map((cell) => (
          <View key={cell.id} style={styles.rowCell}>
            <CellArt cell={cell} size={34} maskSize={30} />
          </View>
        ))}
      </View>
    </PressableScale>
  );
}
