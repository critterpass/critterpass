/**
 * One place set in the premium look (undesigned as a page; built from the Critterdex's cells): a
 * pushed page titled with the place, the home-set eyebrow, the found count, a bar with a segment
 * per critter (sun once found), and the critters three a row as white cells: found ones as their
 * sticker, the rest as silhouettes with the city, lit corner dots per form owned. Found cells open
 * the critter, a locked one where to find it. The cells rise in as the page opens.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { Rarity } from '@cp/critter-art';

import {
  PressableScale,
  Text,
  enterTransition,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { backLabel, unknownName } from '../../critters-copy';
import {
  backToDex,
  homeSetEyebrow,
  loadingSet,
  lockedCell,
  pendingLabel,
} from '../../dex/dex-copy';
import type { CritterCell } from '../../dex/dex-model';
import { gridTileWidth } from '../../dex/grid';
import { useSet } from '../../dex/use-dex';
import { critterRoute, whereRoute } from '../../routes';
import { CrittersPageLoading, CrittersPageMissing } from '../components/page-states';
import { tierAccent } from '../components/tier';
import { CellArt } from '../dex/dex-cells';

const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const GAP = 10;

const useStyles = makePremiumStyles((th) => ({
  body: { paddingHorizontal: th.space.gutter, paddingTop: 8, gap: 14 },
  bar: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  cell: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  dots: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
}));

function Cell(props: {
  readonly cell: CritterCell;
  readonly width: number;
  readonly index: number;
  readonly onOpen: (() => void) | undefined;
}) {
  const { cell } = props;
  const th = usePremiumTheme();
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const name = cell.found ? (cell.name ?? unknownName()) : unknownName();
  const label = cell.found ? `${name}, ${cell.city}` : lockedCell(cell.city);
  return (
    <Animated.View entering={enterTransition(reduced).delay(reduced ? 0 : props.index * 30)}>
      <PressableScale
        accessibilityRole={props.onOpen === undefined ? 'image' : 'button'}
        accessibilityLabel={label}
        disabled={props.onOpen === undefined}
        {...(props.onOpen === undefined ? {} : { onPress: props.onOpen })}
        style={[styles.cell, props.width > 0 ? { width: props.width } : { opacity: 0 }]}
        testID={`critters-set-cell-${cell.no}`}
      >
        <View style={styles.dots}>
          {RARITIES.map((tier) => (
            <View
              key={tier}
              style={[
                styles.dot,
                {
                  backgroundColor: cell.lit.includes(tier)
                    ? tierAccent(th, tier)
                    : th.color.control,
                },
              ]}
            />
          ))}
        </View>
        <CellArt cell={cell} size={64} maskSize={58} />
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={1}>
          {cell.pending ? pendingLabel() : cell.city}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

export function PremiumSetScreen({ setId }: { readonly setId: string }) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const { loaded, set } = useSet(setId);
  const [width, setWidth] = useState(0);
  if (set === null) {
    return loaded ? (
      <CrittersPageMissing title={backToDex()} testID="critters-set-missing" />
    ) : (
      <CrittersPageLoading title={backToDex()} label={loadingSet()} testID="critters-set-loading" />
    );
  }
  const tile = gridTileWidth(width, GAP);
  return (
    <PushScreen title={set.name} backLabel={backLabel()} testID="critters-set">
      <View style={styles.body}>
        <View style={{ gap: 2 }}>
          {set.home ? (
            <Text variant="tier" color={th.color.guideName}>
              {homeSetEyebrow()}
            </Text>
          ) : null}
          <Text variant="stat" testID="critters-set-count">
            {String(set.found)}
            <Text variant="stat" tone="placeholder">{`/${set.total}`}</Text>
          </Text>
        </View>
        <View
          style={styles.bar}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {set.cells.map((cell) => (
            <View
              key={cell.id}
              style={[
                styles.segment,
                { backgroundColor: cell.found ? th.accent.sun : th.color.progressTodo },
              ]}
            />
          ))}
        </View>
        <View style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {set.cells.map((cell, index) => (
            <Cell
              key={cell.id}
              cell={cell}
              width={tile}
              index={index}
              onOpen={
                cell.found
                  ? () => router.push(critterRoute(cell.id))
                  : cell.nextFormId === null
                    ? undefined
                    : () => router.push(whereRoute(cell.nextFormId ?? ''))
              }
            />
          ))}
        </View>
      </View>
    </PushScreen>
  );
}
