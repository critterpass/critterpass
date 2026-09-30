/**
 * The hub's tiles (3k-1): PLAN, BOOKINGS and MONEY from this area, plus tiles other areas register
 * (QUESTS). Four tiles sit 2×2; while only three are registered for the trip they share one row.
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
  compact: { flexGrow: 1, minHeight: th.space['32'] * 3 },
  cell: { flex: 1 },
}));

export function HubTile({
  tile,
  compact = false,
}: {
  readonly tile: HubTileData;
  readonly compact?: boolean;
}) {
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
      style={compact ? styles.compact : styles.tile}
      testID={`trip-hub-tile-${tile.key}`}
    >
      <Stack flex={1} justify="space-between" gap="12">
        <Row justify="space-between" align="center">
          <Text variant="eyebrow" color={ink}>
            {upper(tile.title, locale)}
          </Text>
          <Icon name={tile.icon} size={24} decorative color={ink} />
        </Row>
        <Stack gap="2">
          <Text variant={compact ? 'h3' : 'h2'} color={ink} autoFit>
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

/** Tiles in rows of two, or one row of three while a fourth is not registered. */
export function HubTiles({
  tiles,
}: {
  readonly tiles: readonly { key: string; node: ReactNode }[];
}) {
  const styles = useStyles();
  const rows =
    tiles.length === 3
      ? [tiles]
      : tiles.reduce<{ key: string; node: ReactNode }[][]>((acc, tile, index) => {
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
        </Row>
      ))}
    </Stack>
  );
}

/** What a registered tile renders with. */
export interface HubTileProps {
  readonly tripId: string;
  readonly crewId: string;
  readonly compact: boolean;
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
