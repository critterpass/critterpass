/**
 * The sheet's peek under the places map (7c-1): "86 PLACES IN VIEW", "Biggest first: what fits your
 * days" (outside a trip, biggest first alone) and ≡ LIST. With no place lit in view it says so.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { inViewCount } from './places-copy';

export interface PlacesPeekProps {
  readonly count: number;
  readonly loading: boolean;
  readonly inTrip: boolean;
  readonly onList: () => void;
}

const useStyles = makeStyles((t) => ({
  peek: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    marginHorizontal: t.space['8'],
    paddingHorizontal: t.space['16'],
    paddingVertical: t.space['14'],
    borderRadius: t.radius.cardBig,
    backgroundColor: t.semantic.bg.base,
  },
  copy: { flex: 1, minWidth: 0, gap: t.space['2'] },
  list: {
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['10'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
}));

export function PlacesPeek({ count, loading, inTrip, onList }: PlacesPeekProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const title = loading
    ? t({ id: 'places.peek.loading', message: 'Fetching places' })
    : count === 0
      ? t({ id: 'places.peek.none', message: 'No places in view' })
      : inViewCount(count);
  const line =
    count === 0 && !loading
      ? t({ id: 'places.peek.noneHint', message: 'Zoom out or pick another filter.' })
      : inTrip
        ? t({ id: 'places.peek.trip', message: 'Biggest first: what fits your days' })
        : t({ id: 'places.peek.destination', message: 'Biggest first: what the crew saved' });
  return (
    <View style={styles.peek} testID="places-peek">
      <View style={styles.copy}>
        <Text variant="h3" numberOfLines={2} singleLine={false} testID="places-peek-count">
          {upper(title, i18n.locale)}
        </Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
          {line}
        </Text>
      </View>
      <PressScale
        style={styles.list}
        widthClass="narrow"
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'places.showList', message: 'Show as a list' })}
        onPress={onList}
        testID="places-peek-list"
      >
        <Text variant="label">
          {upper(t({ id: 'places.list', message: '≡ List' }), i18n.locale)}
        </Text>
      </PressScale>
    </View>
  );
}
