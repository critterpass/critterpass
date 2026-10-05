/**
 * BROWSE BY KIND (Explore in a trip): the kinds of place the guide covers here with how many of
 * each, fullest first; a tile opens the places list on that kind.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import * as copy from './copy';

export interface KindTile {
  /** The places list's filter key ("food", "temples"). */
  readonly key: string;
  readonly label: string;
  /** Already formatted ("101"). */
  readonly count: string;
  readonly icon: DoodleName;
  readonly onPress?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space['10'], paddingHorizontal: t.size.gutter },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['8'] },
  cell: { flexBasis: '47%', flexGrow: 1 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    minHeight: 44,
    paddingHorizontal: t.space['12'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
  },
  label: { flex: 1, minWidth: 0 },
}));

export function KindsRow({ kinds }: { readonly kinds: readonly KindTile[] }) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  if (kinds.length === 0) return null;
  return (
    <View style={styles.wrap} testID="explore-trip-kinds">
      <Text variant="eyebrow">{upper(copy.kindsTitle(), i18n.locale)}</Text>
      <View style={styles.grid}>
        {kinds.map((kind) => (
          <PressScale
            key={kind.key}
            accessibilityRole="button"
            accessibilityLabel={copy.kindLabel(kind.label, kind.count)}
            disabled={kind.onPress === undefined}
            onPress={kind.onPress}
            style={styles.cell}
            testID={`explore-trip-kind-${kind.key}`}
          >
            <View style={styles.tile}>
              <Icon name={kind.icon} size={18} decorative />
              <View style={styles.label}>
                <Text variant="label" numberOfLines={1}>
                  {kind.label}
                </Text>
              </View>
              <Text variant="label" color={theme.semantic.text.secondary}>
                {kind.count}
              </Text>
            </View>
          </PressScale>
        ))}
      </View>
    </View>
  );
}
