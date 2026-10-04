/**
 * The top of the places map and list (7c-1, 7c-3): the search pill ("Search Bali, or ask Tokek")
 * with the way between map and list, and one row of chips: ALL, SAVED, IN THE PLAN and the
 * categories with places, each with its count; one chip at a time. In results mode the search's
 * own chips lead the row, and taking one off leaves the results.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { IconButton } from '@/ui/buttons/IconButton';
import { TextField } from '@/ui/inputs/TextField';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { PressScale } from '@/ui/press/PressScale';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { FilterChipRow, type PlanningChip } from '@/ui/planning';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import { groupLabel } from './places-copy';
import type { PlaceCounts, PlacesFilter } from './places-model';

const MAX_GROUPS = 4;
const GUIDE = 28;

export interface PlacesHeaderProps {
  readonly destinationName: string;
  readonly guide: GuideFacts;
  readonly mode: 'map' | 'list';
  readonly onBack: () => void;
  readonly onSearch: () => void;
  /**
   * Outside a trip the pill is a field that searches the places on this phone (it works in
   * airplane mode) instead of opening the search.
   */
  readonly query?: string | undefined;
  readonly onQuery?: ((text: string) => void) | undefined;
  readonly onToggleMode: () => void;
  readonly counts: PlaceCounts;
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  /** Inside a trip: the IN THE PLAN chip. */
  readonly inTrip: boolean;
  /** The search's chips in results mode. */
  readonly resultChips?: readonly string[] | undefined;
  readonly onLeaveResults?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  top: { gap: t.space['10'] },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    paddingHorizontal: t.space['16'],
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['10'],
    paddingStart: t.space['12'],
    paddingEnd: t.space['6'],
    paddingVertical: t.space['6'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
  placeholder: { flex: 1, minWidth: 0 },
  mode: {
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['10'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.control,
  },
}));

export function PlacesHeader(props: PlacesHeaderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  useBackAffordance();
  const place = props.destinationName;
  const guide = props.guide.name;
  const prompt = t({ id: 'places.search', message: `Search ${place}, or ask ${guide}` });
  const localPrompt = t({ id: 'places.searchHere', message: `Search ${place}` });
  const toList = props.mode === 'map';
  const chips: PlanningChip[] = [
    ...(props.resultChips ?? []).map((label, index) => ({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a chip key, never copy.
      key: `result-${String(index)}`,
      label: upper(label, i18n.locale),
      selected: true,
      removable: true,
    })),
    {
      key: 'all',
      label: upper(t({ id: 'places.chip.all', message: 'All' }), i18n.locale),
      count: props.counts.all,
      selected: props.filter === 'all',
    },
    {
      key: 'saved',
      label: upper(t({ id: 'places.chip.saved', message: 'Saved' }), i18n.locale),
      count: props.counts.saved,
      selected: props.filter === 'saved',
    },
    ...(props.inTrip
      ? [
          {
            key: 'plan',
            label: upper(t({ id: 'places.chip.plan', message: 'In the plan' }), i18n.locale),
            count: props.counts.plan,
            selected: props.filter === 'plan',
          },
        ]
      : []),
    ...props.counts.groups.slice(0, MAX_GROUPS).map(({ group }) => ({
      key: group,
      label: upper(groupLabel(group), i18n.locale),
      selected: props.filter === group,
    })),
  ];
  const choose = (key: string) => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a chip key, never copy.
    if (key.startsWith('result-')) return;
    const next = key as PlacesFilter;
    // Tapping the chosen chip again goes back to everything.
    props.onFilter(next === props.filter ? 'all' : next);
  };
  return (
    <View style={styles.top} pointerEvents="box-none">
      <View style={styles.bar}>
        <IconButton
          label={t({ id: 'places.back', message: 'Back' })}
          glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
          onPress={props.onBack}
          testID="places-back"
        />
        <View style={styles.pill}>
          <Sticker kind={props.guide.kind} name={guide} size={GUIDE} />
          {props.onQuery === undefined ? (
            <PressScale
              style={styles.placeholder}
              accessibilityRole="search"
              accessibilityLabel={prompt}
              onPress={props.onSearch}
              testID="places-search"
            >
              <Text variant="body" color={theme.semantic.text.secondary} numberOfLines={1}>
                {prompt}
              </Text>
            </PressScale>
          ) : (
            <View style={styles.placeholder}>
              <TextField
                label={localPrompt}
                labelHidden
                placeholder={localPrompt}
                value={props.query ?? ''}
                onChangeText={props.onQuery}
                autoCorrect={false}
                returnKeyType="search"
                testID="places-search-field"
              />
            </View>
          )}
          <PressScale
            style={styles.mode}
            widthClass="narrow"
            accessibilityRole="button"
            accessibilityLabel={
              toList
                ? t({ id: 'places.showList', message: 'Show as a list' })
                : t({ id: 'places.showMap', message: 'Show the map' })
            }
            onPress={props.onToggleMode}
            testID={toList ? 'places-to-list' : 'places-to-map'}
          >
            <Text variant="label">
              {toList
                ? upper(t({ id: 'places.list', message: '≡ List' }), i18n.locale)
                : upper(t({ id: 'places.map', message: '◎ Map' }), i18n.locale)}
            </Text>
          </PressScale>
        </View>
      </View>
      <FilterChipRow
        chips={chips}
        onPress={choose}
        onRemove={() => props.onLeaveResults?.()}
        testID="places-chips"
      />
    </View>
  );
}
