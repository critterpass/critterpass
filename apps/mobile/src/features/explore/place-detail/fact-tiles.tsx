/**
 * The four fact tiles under a place's name (7e-1): OPEN that day, ENTRY, TAKES and WEAR. A tile
 * with nothing behind it is left out, never guessed: our own hours, and only approved editorial
 * facts.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { FactTiles } from './context';
import { factTileList } from './fact-tile-model';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.space['8'] },
  tile: {
    flex: 1,
    minWidth: 0,
    gap: t.space['2'],
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['8'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
  },
}));

export function FactTileRow({ facts }: { readonly facts: FactTiles }) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const tiles = factTileList(facts);
  if (tiles.length === 0) return null;
  return (
    <View style={styles.row} testID="place-detail-facts">
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={styles.tile}
          accessible
          accessibilityLabel={`${tile.label}: ${tile.value}`}
          testID={`place-detail-fact-${tile.key}`}
        >
          <Text variant="label" color={theme.semantic.text.secondary}>
            {upper(tile.label, i18n.locale)}
          </Text>
          <Text variant="title">{upper(tile.value, i18n.locale)}</Text>
        </View>
      ))}
    </View>
  );
}
