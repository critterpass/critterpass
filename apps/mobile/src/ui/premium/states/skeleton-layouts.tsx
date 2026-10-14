/**
 * The designed wait (1.02 "Loading · the layout, shimmering"): the page's shape in skeletons, a
 * shimmering photo block and a card of rows, with the thinking critter and its line at the foot.
 * A page that waits shows these in place of its content, so it never opens on an empty card with a
 * lone line in the middle. `WaitingLayout` is the whole 1.02 page; the pieces build a page's own
 * shape (a deck card, a hero over rows).
 */
/* eslint-disable lingui/no-unlocalized-strings -- placement percentages and turns, never copy */
import { StyleSheet, View } from 'react-native';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { LoadingCritter, Skeleton } from './Skeleton';

/** A shimmering photo block with the two soft tiles the design floats on it. */
export function SkeletonPhoto({ height }: { readonly height: number }) {
  const t = usePremiumTheme();
  const tile = Math.round(Math.min(64, height * 0.24));
  return (
    <View style={{ height }}>
      <Skeleton height={height} radius={t.radius.cardLarge} tone="block" />
      <View
        style={[
          styles.tile,
          {
            width: tile,
            height: tile,
            borderRadius: t.radius.cardRow,
            backgroundColor: t.color.card,
            left: '6%',
            top: '24%',
            transform: [{ rotate: '-4deg' }],
          },
        ]}
      />
      <View
        style={[
          styles.tile,
          {
            width: tile,
            height: tile,
            borderRadius: t.radius.cardRow,
            backgroundColor: t.color.card,
            right: '17%',
            bottom: '16%',
            transform: [{ rotate: '5deg' }],
          },
        ]}
      />
    </View>
  );
}

/** A card of skeleton rows: a tile, a title and a line, and a pill at the end. */
export function SkeletonList({ rows = 4 }: { readonly rows?: number }) {
  const t = usePremiumTheme();
  return (
    <View
      style={{
        backgroundColor: t.color.card,
        borderRadius: t.radius.card,
        boxShadow: t.shadow.card,
        paddingHorizontal: t.space.gap10,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: rows }, (_, row) => (
        <View
          key={row}
          style={[
            styles.row,
            {
              gap: t.space.gap12,
              paddingVertical: t.space.gap10,
              borderTopWidth: row === 0 ? 0 : StyleSheet.hairlineWidth,
              borderColor: t.color.hairline,
            },
          ]}
        >
          <Skeleton width={40} height={40} radius={t.radius.cardRow - 4} tone="soft" />
          <View style={[styles.grow, { gap: t.space.gap8 }]}>
            <Skeleton height={t.space.gap10} width={`${52 - (row % 3) * 8}%`} />
            <Skeleton height={t.space.gap8} width={`${74 - (row % 2) * 10}%`} tone="soft" />
          </View>
          <Skeleton width={50} height={22} tone="soft" />
        </View>
      ))}
    </View>
  );
}

/** A card face waiting for its place (a swipe card): the photo, then the title and its line. */
export function SkeletonCardFace() {
  const t = usePremiumTheme();
  return (
    <View style={[styles.grow, { gap: t.space.gap12, padding: t.space.gap8 }]}>
      <View style={styles.grow}>
        <Skeleton height={0} tone="block" radius={t.radius.cardLarge} style={styles.grow} />
      </View>
      <View style={{ gap: t.space.gap8, paddingHorizontal: t.space.gap8 }}>
        <Skeleton height={t.space.gap16} width="62%" />
        <Skeleton height={t.space.gap10} width="38%" tone="soft" />
      </View>
    </View>
  );
}

export interface WaitingLayoutProps {
  /** The progressive line under the critter ("Tokek is fetching the plan…"). */
  readonly label: string;
  /** The rows under the photo. @default 4 */
  readonly rows?: number;
  /** No photo block: a list page. */
  readonly photo?: boolean;
  readonly testID?: string;
}

/** The 1.02 wait for a whole page body: photo, rows, then the critter and its line at the foot. */
export function WaitingLayout({ label, rows = 4, photo = true, testID }: WaitingLayoutProps) {
  const t = usePremiumTheme();
  return (
    <View
      style={[
        styles.grow,
        { gap: t.space.gap16, paddingHorizontal: t.space.gutter, paddingTop: t.space.gap8 },
      ]}
    >
      <View style={[styles.grow, { gap: t.space.gap16, overflow: 'hidden' }]}>
        {photo ? <SkeletonPhoto height={240} /> : null}
        <SkeletonList rows={rows} />
      </View>
      <LoadingCritter label={label} {...(testID === undefined ? {} : { testID })} />
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  tile: { position: 'absolute', opacity: 0.7 },
});
