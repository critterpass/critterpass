/**
 * The hub's tiles (3k-1): PLAN, BOOKINGS and MONEY from this area, plus tiles other areas register
 * (QUESTS). They sit on the render's two-column grid: four fill it 2×2, and an odd last tile keeps
 * its half width.
 */
import { upper } from '@cp/i18n';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import type { CardTone } from '@/ui/cards/tone';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface HubTileData {
  readonly key: string;
  readonly title: string;
  readonly value: string;
  readonly caption: string | null;
  readonly icon: DoodleName;
  readonly tone: CardTone;
  readonly onPress?: () => void;
}

const useStyles = makeStyles((th) => ({
  // A row's tiles share its height, whichever caption wraps furthest.
  tile: { flexGrow: 1, minHeight: th.space['32'] * 3 + th.space['16'] },
  cell: { flex: 1 },
  title: { flexShrink: 1 },
}));

export function HubTile({ tile }: { readonly tile: HubTileData }) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const ink = theme.semantic.text.onAccent;
  return (
    <Card
      tone={tile.tone}
      radius="cardBig"
      {...(tile.onPress === undefined ? {} : { onPress: tile.onPress })}
      accessibilityLabel={[tile.title, tile.value, tile.caption].filter(Boolean).join(', ')}
      style={styles.tile}
      testID={`trip-hub-tile-${tile.key}`}
    >
      <Stack flex={1} justify="space-between" gap="12">
        <Row justify="space-between" align="center" gap="6">
          {/* A longer title ("LỊCH TRÌNH") wraps beside the icon at a word break; a word too long
              for the room shrinks rather than splitting. */}
          <Text variant="eyebrow" color={ink} style={styles.title} autoFit>
            {upper(tile.title, locale)}
          </Text>
          <Icon name={tile.icon} size={24} decorative color={ink} />
        </Row>
        <Stack gap="2">
          <Text variant="h2" color={ink} autoFit>
            {upper(tile.value, locale)}
          </Text>
          {tile.caption === null ? null : (
            <Text variant="bodySm" color={ink}>
              {tile.caption}
            </Text>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}

/** Tiles in rows of two; a lone last tile keeps its column's width beside an empty one. */
export function HubTiles({
  tiles,
}: {
  readonly tiles: readonly { key: string; node: ReactNode }[];
}) {
  const styles = useStyles();
  const rows = tiles.reduce<{ key: string; node: ReactNode }[][]>((acc, tile, index) => {
    if (index % 2 === 0) acc.push([tile]);
    else acc[acc.length - 1]?.push(tile);
    return acc;
  }, []);
  return (
    <Stack gap="12" testID="trip-hub-tiles">
      {rows.map((row) => (
        <Row key={row.map((tile) => tile.key).join('|')} gap="12" align="stretch">
          {row.map((tile) => (
            <View key={tile.key} style={styles.cell}>
              {tile.node}
            </View>
          ))}
          {row.length === 1 ? <View style={styles.cell} /> : null}
        </Row>
      ))}
    </Stack>
  );
}

/** What a registered tile renders with. */
export interface HubTileProps {
  readonly tripId: string;
  readonly crewId: string;
}

interface Registered {
  readonly key: string;
  readonly order: number;
  readonly Tile: (props: HubTileProps) => ReactNode;
}

let registered: readonly Registered[] = [];
const listeners = new Set<() => void>();

/**
 * Another area adds a hub tile (QUESTS registers from the quests area). `order` places it after
 * PLAN (10), BOOKINGS (20) and MONEY (30). Returns the unregister function.
 */
export function registerHubTile(entry: Registered): () => void {
  registered = [...registered.filter((tile) => tile.key !== entry.key), entry].sort(
    (a, b) => a.order - b.order,
  );
  listeners.forEach((listener) => listener());
  return () => {
    registered = registered.filter((tile) => tile !== entry);
    listeners.forEach((listener) => listener());
  };
}

export function useRegisteredHubTiles(): readonly Registered[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => registered,
  );
}
