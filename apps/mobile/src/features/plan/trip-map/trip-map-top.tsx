/**
 * The top of the trip map (7a-1, 7a-2): the search pill ("Search Bali, or ask Tokek", to search
 * scoped to the map) and ≡ LIST (the places list), each once its screen is registered, then the
 * filter chips. While the trip has nothing saved yet only the search pill shows (7i-1).
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { FilterChipRow } from '@/ui/planning';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { weekday } from './format';
import type { MapFilter } from './map-places';
import type { TripMapModel } from './sheet-props';
import type { TripDay } from './trip-days';
import { DAY_CHIP, filterChips, nextFilter } from './trip-map-filters';
import { useWayOut } from './use-ways-out';

const useStyles = makeStyles((t) => ({
  top: { position: 'absolute', start: 0, end: 0, gap: t.space['10'] },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    marginHorizontal: t.size.gutter,
    paddingStart: t.space['12'],
    paddingEnd: t.space['6'],
    minHeight: 52,
    borderRadius: t.radius.pill,
    backgroundColor: t.semantic.bg.raised,
  },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: t.space['10'] },
  chips: { paddingStart: t.size.gutter },
}));

export interface TripMapTopProps {
  readonly model: TripMapModel;
  readonly day: TripDay | null;
  readonly traced: boolean;
  readonly filter: MapFilter;
  readonly categories: readonly string[];
  readonly onDayChip: () => void;
  readonly onFilter: (filter: MapFilter) => void;
}

export function TripMapTop(props: TripMapTopProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { model } = props;
  const search = useWayOut('7d-1', { tripId: model.tripId, scope: 'map' });
  const list = useWayOut('7c-3', { tripId: model.tripId });
  const place = model.destination ?? '';
  const guide = model.guide.name;
  const sticker = GUIDE_STICKERS[model.guide.id];
  const prompt =
    place === ''
      ? t({ id: 'plan.tripMap.searchNoPlace', message: `Search, or ask ${guide}` })
      : t({ id: 'plan.tripMap.search', message: `Search ${place}, or ask ${guide}` });
  return (
    <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
      {search === null && list === null ? null : (
        <View style={styles.bar}>
          <PressScale
            style={styles.search}
            accessibilityRole="search"
            accessibilityLabel={prompt}
            {...(search === null ? {} : { onPress: search })}
            testID="trip-map-search"
          >
            <Sticker kind={sticker.kind} name={sticker.name} size={28} />
            <Text variant="body" color={theme.semantic.text.secondary} numberOfLines={1}>
              {prompt}
            </Text>
          </PressScale>
          {list === null ? null : (
            <PillButton
              size="sm"
              variant="secondary"
              label={t({ id: 'plan.tripMap.list', message: '≡ List' })}
              onPress={list}
              testID="trip-map-list"
            />
          )}
        </View>
      )}
      {model.empty ? null : (
        <View style={styles.chips}>
          <FilterChipRow
            chips={filterChips({
              day: props.day,
              dayChosen: props.traced,
              weekday: weekday(locale, props.day?.date ?? null),
              saved: model.ideas.length + model.placedCount,
              categories: props.categories,
              filter: props.filter,
            })}
            onPress={(key) =>
              key === DAY_CHIP ? props.onDayChip() : props.onFilter(nextFilter(props.filter, key))
            }
            testID="trip-map-chips"
          />
        </View>
      )}
    </View>
  );
}
