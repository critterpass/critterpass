/**
 * The top of the trip map (7a-1, 7a-2): a back arrow (the map is pushed over the tabs, so it needs
 * a way out that shows), the search pill ("Search Bali, or ask Tokek", to search scoped to the
 * map) and ≡ LIST (the places list), each once its screen is registered, then the filter chips.
 * While the trip has nothing saved yet only the back arrow and the search pill show (7i-1).
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
import { BackButton } from '@/ui/shell/BackButton';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dateLine } from './format';
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
    paddingStart: t.space['2'],
    paddingEnd: t.space['6'],
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: t.semantic.bg.raised,
  },
  // The prompt gives way to LIST: a long one (Vietnamese) is cut, never drawn under the pill.
  search: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['10'],
  },
  prompt: { flex: 1, minWidth: 0 },
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
  readonly onBack: () => void;
  /** Saved places two or more of the crew back (CREW PICKS shows only when there are some). */
  readonly crewPicks: number;
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
      <View style={styles.bar}>
        <BackButton onPress={props.onBack} testID="trip-map-back" />
        {search === null && list === null ? null : (
          <PressScale
            style={styles.search}
            accessibilityRole="search"
            accessibilityLabel={prompt}
            {...(search === null ? {} : { onPress: search })}
            testID="trip-map-search"
          >
            <Sticker kind={sticker.kind} name={sticker.name} size={28} />
            <Text
              variant="body"
              color={theme.semantic.text.secondary}
              numberOfLines={1}
              style={styles.prompt}
            >
              {prompt}
            </Text>
          </PressScale>
        )}
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
      {model.empty ? null : (
        <View style={styles.chips}>
          <FilterChipRow
            chips={filterChips({
              day: props.day,
              dayChosen: props.traced,
              weekday: props.day?.date == null ? '' : dateLine(locale, props.day.date),
              saved: model.ideas.length + model.placedCount,
              crewPicks: props.crewPicks,
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
