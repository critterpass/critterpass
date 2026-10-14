/**
 * The hub's "four doors" (6.01): white tiles two to a row, the door's name in muted 13/600, a
 * tilted sticker in the corner, the value large at the bottom and a muted line under it. Tiles
 * other areas register (quests, photos) wear the same tile through the hub tile look.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import { HubTileLook, type HubTileData } from '../../hub/tiles';
import { IconTile } from '../components/IconTile';
import type { LineIconName } from '../components/LineIcon';
import { turn } from '../components/turn';

const ICON: Readonly<Record<string, LineIconName>> = {
  cal: 'calendar',
  ticket: 'card',
  wallet: 'wallet',
  star: 'star',
  camera: 'camera',
};

function Tile({ tile }: { readonly tile: HubTileData }) {
  const th = usePremiumTheme();
  const look = {
    plan: th.color.status.voteOpen,
    bookings: th.color.status.rain,
    money: th.color.status.booked,
    quests: th.color.status.tangerine,
    album: th.color.status.maybe,
  }[tile.key] ?? { bg: th.color.control, text: th.color.ink };
  return (
    <PressableScale
      {...(tile.onPress === undefined ? {} : { onPress: tile.onPress })}
      disabled={tile.onPress === undefined}
      accessibilityRole="button"
      accessibilityLabel={[tile.title, tile.value, tile.caption].filter(Boolean).join(', ')}
      style={styles.cell}
      testID={`trip-hub-tile-${tile.key}`}
    >
      <View
        style={[
          styles.tile,
          {
            borderRadius: th.radius.cardRow,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <Text variant="label" tone="muted" numberOfLines={1} style={styles.title}>
          {tile.title}
        </Text>
        <View style={[styles.sticker, { transform: [turn(8)] }]}>
          <IconTile name={ICON[tile.icon] ?? 'star'} bg={look.bg} color={look.text} size={40} />
        </View>
        <View>
          <Text variant="stat" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {tile.value}
          </Text>
          {tile.caption === null ? null : (
            // A half-width tile is narrow: the line under the value wraps to a second line before
            // it is ever cut.
            <Text variant="caption" tone="muted" numberOfLines={2} singleLine={false}>
              {tile.caption}
            </Text>
          )}
        </View>
      </View>
    </PressableScale>
  );
}

/** The registered tiles' look: this hub's tile element for the tile's data. */
const drawTile = (tile: HubTileData) => <Tile tile={tile} />;

export interface HubTilesProps {
  readonly tiles: readonly HubTileData[];
  /** Tiles registered by other areas, already drawn. */
  readonly extra: readonly { readonly key: string; readonly node: ReactNode }[];
}

export function HubTiles({ tiles, extra }: HubTilesProps) {
  const th = usePremiumTheme();
  const cells = [
    ...tiles.map((tile) => ({ key: tile.key, node: <Tile tile={tile} /> })),
    // Registered tiles draw through `HubTile`, which takes this hub's look from the context.
    ...extra.map((item) => ({
      key: item.key,
      node: <HubTileLook.Provider value={drawTile}>{item.node}</HubTileLook.Provider>,
    })),
  ];
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(cells.slice(i, i + 2));
  return (
    <View
      style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap10 }}
      testID="trip-hub-tiles"
    >
      {rows.map((row) => (
        <View
          key={row.map((cell) => cell.key).join('-')}
          style={[styles.row, { gap: th.space.gap10 }]}
        >
          {row.map((cell) => (
            <View key={cell.key} style={styles.cell}>
              {cell.node}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.cell} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
  tile: {
    minHeight: 118,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  // Clear of the tilted 40 pt sticker at the corner.
  title: { paddingRight: 52 },
  sticker: { position: 'absolute', right: 10, top: 8 },
});
