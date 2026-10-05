/**
 * The sheet's peek under the places map (7c-1): "86 PLACES IN VIEW", "Biggest first: what fits your
 * days" (outside a trip, biggest first alone) and ≡ LIST. With no place lit in view it says so and
 * offers to show them all; a filter with nothing behind it (nothing saved yet) says how to fill it.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { inViewCount } from './places-copy';
import { useEmptyWords, type EmptyKind } from './places-empty';

export interface PlacesPeekProps {
  readonly count: number;
  /** Every place the filter lights, in view or not; absent when not counted. */
  readonly total?: number | undefined;
  /** Which words an empty filter gets. */
  readonly empty?: EmptyKind | undefined;
  /** Moves the map to the filter's places. */
  readonly onShowAll?: (() => void) | undefined;
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

export function PlacesPeek(props: PlacesPeekProps) {
  const { count, loading, inTrip, onList, total, onShowAll } = props;
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const emptyWords = useEmptyWords(props.empty ?? 'none');
  const nothing = !loading && total === 0;
  const elsewhere = !loading && count === 0 && total !== undefined && total > 0;
  const title = loading
    ? t({ id: 'places.peek.loading', message: 'Fetching places' })
    : nothing
      ? emptyWords.title
      : count === 0
        ? t({ id: 'places.peek.none', message: 'No places in view' })
        : inViewCount(count);
  const line = nothing
    ? emptyWords.line
    : count === 0 && !loading
      ? t({ id: 'places.peek.noneHint', message: 'Zoom out or pick another filter.' })
      : inTrip
        ? t({ id: 'places.peek.trip', message: 'Biggest first: what fits your days' })
        : t({ id: 'places.peek.destination', message: 'Biggest first: what the crew saved' });
  return (
    <View style={styles.peek} testID={nothing ? 'places-peek-empty' : 'places-peek'}>
      <View style={styles.copy}>
        <Text variant="h3" numberOfLines={2} singleLine={false} testID="places-peek-count">
          {upper(title, i18n.locale)}
        </Text>
        {elsewhere && onShowAll !== undefined ? (
          <PressScale
            widthClass="narrow"
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'places.peek.showAll', message: `Show all ${total}` })}
            onPress={onShowAll}
            testID="places-peek-show-all"
          >
            <Text variant="label" color={theme.semantic.action.primary}>
              {upper(t({ id: 'places.peek.showAll', message: `Show all ${total}` }), i18n.locale)}
            </Text>
          </PressScale>
        ) : (
          <Text
            variant="bodySm"
            color={theme.semantic.text.secondary}
            numberOfLines={nothing ? 3 : 1}
            singleLine={!nothing}
          >
            {line}
          </Text>
        )}
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
