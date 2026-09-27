import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { DoodleName } from '../icons/generated';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, sizeToken } from '../theme';
import { Card } from './Card';
import { SecondaryText } from './SecondaryText';
import type { CardTone } from './tone';

export interface Tile {
  readonly key: string;
  readonly title: string;
  readonly caption?: string;
  /** Stat tiles lead with a big value ("12", "$412"). */
  readonly value?: string;
  readonly icon?: DoodleName;
  readonly art?: ReactNode;
  readonly tone?: CardTone;
  readonly onPress?: () => void;
}

export interface TileGridProps {
  readonly tiles: readonly Tile[];
  /** Hub and help grids are 2 × n; stat grids may use 3. @default 2 */
  readonly columns?: 2 | 3;
}

const useStyles = makeStyles((t) => ({
  cell: { flex: 1, minWidth: 0 },
  tile: { minHeight: sizeToken(t.size.primaryCta, 'height') * 2 },
  filler: { flex: 1 },
}));

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Hub (2 × 2), help and stat tiles in equal columns; each tile is one a11y element. */
export function TileGrid({ tiles, columns = 2 }: TileGridProps) {
  const styles = useStyles();
  return (
    <Stack gap="12">
      {chunk(tiles, columns).map((row) => (
        <Row key={row.map((tile) => tile.key).join('|')} gap="12">
          {row.map((tile) => {
            const label = [tile.value, tile.title, tile.caption].filter(Boolean).join(', ');
            return (
              <View key={tile.key} style={styles.cell}>
                <Card
                  {...(tile.tone ? { tone: tile.tone } : {})}
                  {...(tile.onPress ? { onPress: tile.onPress } : {})}
                  accessibilityLabel={label}
                  style={styles.tile}
                >
                  <Stack gap="8" flex={1} justify="space-between">
                    {tile.art ??
                      (tile.icon ? <Icon name={tile.icon} size={32} decorative /> : null)}
                    <Stack gap="2">
                      {tile.value ? <Text variant="h2">{tile.value}</Text> : null}
                      <Text variant="title">{tile.title}</Text>
                      {tile.caption ? <SecondaryText>{tile.caption}</SecondaryText> : null}
                    </Stack>
                  </Stack>
                </Card>
              </View>
            );
          })}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={index} style={styles.filler} />
          ))}
        </Row>
      ))}
    </Stack>
  );
}
