/**
 * "OR BROWSE" (7d-1): six kinds of place as tiles; a tile opens the places list (7c-3) with that
 * category, or, before the list is registered, searches the kind on the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- category keys and folded search words, never copy. */
import type { PoiCategory } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { makeStyles, Text, useTheme } from '@/ui';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { PressScale } from '@/ui/press/PressScale';

export interface BrowseTile {
  readonly key: string;
  readonly category: PoiCategory;
  /** The folded word the phone's search reads for it ("coffee"). */
  readonly word: string;
  readonly icon: DoodleName;
  readonly label: () => string;
}

export const BROWSE_TILES: readonly BrowseTile[] = [
  {
    key: 'food',
    category: 'food',
    word: 'food',
    icon: 'food',
    label: () => t({ id: 'search.browse.food', message: 'Food' }),
  },
  {
    key: 'temples',
    category: 'temple_shrine',
    word: 'temple',
    icon: 'temple',
    label: () => t({ id: 'search.browse.temples', message: 'Temples' }),
  },
  {
    key: 'waterfalls',
    category: 'nature',
    word: 'waterfall',
    icon: 'wave',
    label: () => t({ id: 'search.browse.waterfalls', message: 'Waterfalls' }),
  },
  {
    key: 'beaches',
    category: 'beach',
    word: 'beach',
    icon: 'sun',
    label: () => t({ id: 'search.browse.beaches', message: 'Beaches' }),
  },
  {
    key: 'coffee',
    category: 'food',
    word: 'coffee',
    icon: 'food',
    label: () => t({ id: 'search.browse.coffee', message: 'Coffee' }),
  },
  {
    key: 'spa',
    category: 'health',
    word: 'spa',
    icon: 'spark',
    label: () => t({ id: 'search.browse.spa', message: 'Spa' }),
  },
];

const useStyles = makeStyles((th) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['8'],
    minHeight: 44,
    paddingHorizontal: th.space['12'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.raised,
  },
  cell: { flexBasis: '31%', flexGrow: 1 },
}));

export function BrowseGrid({ onBrowse }: { readonly onBrowse: (tile: BrowseTile) => void }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space['8'] }}>
      <Text variant="eyebrow">{t({ id: 'search.browse.eyebrow', message: 'Or browse' })}</Text>
      <View style={styles.grid}>
        {BROWSE_TILES.map((tile) => (
          <PressScale
            key={tile.key}
            accessibilityRole="button"
            accessibilityLabel={tile.label()}
            onPress={() => onBrowse(tile)}
            style={styles.cell}
            testID={`search-browse-${tile.key}`}
          >
            <View style={styles.tile}>
              <Icon name={tile.icon} size={18} decorative />
              <Text variant="label" numberOfLines={1}>
                {tile.label()}
              </Text>
            </View>
          </PressScale>
        ))}
      </View>
    </View>
  );
}
