/**
 * "TOKEK READ IT AS" (7d-2): the parse's chips, each with × to take it off, and the guide's line
 * on what the plan left out ("Wednesday's already Locavore, so I looked at your other nights.").
 * Words come from the app's own templates on the chip codes, never from the model.
 */
import type { ExcludeReason, PoiCategory, SearchChip } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';
import { makeStyles, Text, useTheme } from '@/ui';
import { GuideLine, type GuideId } from '@/ui/people/GuideLine';
import { PressScale } from '@/ui/press/PressScale';

import { GuideSticker } from './guide-sticker';
import { chipKey } from './plain-filters';
import type { SearchDay } from './use-search-trip';

export interface ChipWords {
  readonly days: readonly SearchDay[];
  /** A place's name by id ("Tanah Lot"), when on the phone. */
  readonly placeName: (poiId: string) => string | null;
}

export function categoryWord(category: PoiCategory): string {
  switch (category) {
    case 'food':
      return t({ id: 'search.chip.category.food', message: 'Food' });
    case 'temple_shrine':
      return t({ id: 'search.chip.category.temple', message: 'Temples' });
    case 'nature':
      return t({ id: 'search.chip.category.nature', message: 'Nature' });
    case 'beach':
      return t({ id: 'search.chip.category.beach', message: 'Beaches' });
    case 'market':
      return t({ id: 'search.chip.category.market', message: 'Markets' });
    case 'museum':
      return t({ id: 'search.chip.category.museum', message: 'Museums' });
    case 'nightlife':
      return t({ id: 'search.chip.category.nightlife', message: 'Nightlife' });
    case 'shopping':
      return t({ id: 'search.chip.category.shopping', message: 'Shopping' });
    case 'health':
      return t({ id: 'search.chip.category.health', message: 'Spa and wellness' });
    case 'stay':
    case 'transit':
    case 'other':
      return t({ id: 'search.chip.category.other', message: 'Places' });
  }
}

function weekdays(ids: readonly string[], days: readonly SearchDay[]): string {
  return ids
    .map((id) => {
      const day = days.find((entry) => entry.id === id);
      return day?.weekday ?? (day === undefined ? '' : `${String(day.dayNo)}`);
    })
    .filter((word) => word !== '')
    .join(', ');
}

export function chipLabel(chip: SearchChip, words: ChipWords): string {
  switch (chip.code) {
    case 'category':
      return categoryWord(chip.params.category);
    case 'meal': {
      const meal = chip.params.meal;
      if (meal === 'breakfast')
        return t({ id: 'search.chip.meal.breakfast', message: 'Breakfast' });
      if (meal === 'lunch') return t({ id: 'search.chip.meal.lunch', message: 'Lunch' });
      if (meal === 'dinner') return t({ id: 'search.chip.meal.dinner', message: 'Dinner' });
      if (meal === 'coffee') return t({ id: 'search.chip.meal.coffee', message: 'Coffee' });
      return t({ id: 'search.chip.meal.drinks', message: 'Drinks' });
    }
    case 'attribute':
      return attributeWord(chip.params.attribute);
    case 'open_past': {
      const time = chip.params.time;
      return t({ id: 'search.chip.openPast', message: `Open past ${time}` });
    }
    case 'max_minutes': {
      const minutes = chip.params.minutes;
      if (chip.params.from === 'stay') {
        return t({ id: 'search.chip.fromStay', message: `≤ ${minutes} min from the stay` });
      }
      if (chip.params.from === 'poi') {
        const place = words.placeName(chip.params.poi_id) ?? '';
        return t({ id: 'search.chip.fromPlace', message: `≤ ${minutes} min from ${place}` });
      }
      return t({ id: 'search.chip.fromRoute', message: `≤ ${minutes} min off the day's route` });
    }
    case 'exclude_days': {
      const days = weekdays(chip.params.day_ids, words.days);
      return t({ id: 'search.chip.notDays', message: `Not ${days}` });
    }
    case 'price_max': {
      const level = '$'.repeat(chip.params.level);
      return t({ id: 'search.chip.price', message: `Up to ${level}` });
    }
  }
}

function attributeWord(attribute: string): string {
  switch (attribute) {
    case 'quiet':
      return t({ id: 'search.chip.attr.quiet', message: 'Quiet' });
    case 'view':
      return t({ id: 'search.chip.attr.view', message: 'A view' });
    case 'late':
      return t({ id: 'search.chip.attr.late', message: 'Late' });
    case 'outdoor':
      return t({ id: 'search.chip.attr.outdoor', message: 'Outdoors' });
    case 'indoor':
      return t({ id: 'search.chip.attr.indoor', message: 'Indoors' });
    case 'cheap':
      return t({ id: 'search.chip.attr.cheap', message: 'Cheap' });
    case 'kid_friendly':
      return t({ id: 'search.chip.attr.kids', message: 'Good with kids' });
    case 'vegetarian':
      return t({ id: 'search.chip.attr.vegetarian', message: 'Vegetarian' });
    case 'local':
      return t({ id: 'search.chip.attr.local', message: 'Local' });
    default:
      return t({ id: 'search.chip.attr.sunset', message: 'Sunset' });
  }
}

/** The line under the chips, from the exclude reason's code. */
export function excludeLine(
  reason: ExcludeReason,
  days: readonly SearchDay[],
  itemTitles: ReadonlyMap<string, string>,
): string {
  const day = weekdays(reason.params.day_ids, days);
  const title =
    reason.params.stable_id === undefined ? undefined : itemTitles.get(reason.params.stable_id);
  switch (reason.code) {
    case 'day_has_meal':
      return title === undefined
        ? t({
            id: 'search.exclude.mealNoTitle',
            message: `${day} already has that meal, so I looked at your other days.`,
          })
        : t({
            id: 'search.exclude.meal',
            message: `${day}’s already ${title}, so I looked at your other nights.`,
          });
    case 'day_full':
      return t({
        id: 'search.exclude.full',
        message: `${day}’s full, so I looked at your other days.`,
      });
    case 'day_travel':
      return t({
        id: 'search.exclude.travel',
        message: `${day} is a travel day, so I looked at your other days.`,
      });
  }
}

const CROSS = '×';

const useStyles = makeStyles((th) => ({
  block: { gap: th.space['10'] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    paddingStart: th.space['14'],
    borderRadius: 18,
  },
  remove: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
}));

function removeLabel(label: string): string {
  return t({ id: 'search.chip.remove', message: `Remove ${label}` });
}

export interface ChipBlockProps {
  readonly chips: readonly SearchChip[];
  readonly words: ChipWords;
  readonly note: string | null;
  readonly guide: GuideId;
  readonly guideName: string;
  readonly onRemove: (key: string) => void;
}

export function ChipBlock({ chips, words, note, guide, guideName, onRemove }: ChipBlockProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (chips.length === 0) return null;
  return (
    <View style={styles.block} testID="search-chips">
      <Text variant="eyebrow">
        {t({ id: 'search.chips.eyebrow', message: `${guideName} read it as` })}
      </Text>
      <View style={styles.wrap}>
        {chips.map((chip) => {
          const key = chipKey(chip);
          const label = chipLabel(chip, words);
          const lit = chip.code === 'exclude_days';
          const ink = lit ? theme.semantic.text.onAccent : theme.semantic.text.primary;
          return (
            <View
              key={key}
              style={[
                styles.chip,
                { backgroundColor: lit ? tokens.color.yellow : theme.semantic.bg.raised },
              ]}
              testID={`chip-${key}`}
            >
              <Text variant="label" color={ink} numberOfLines={1}>
                {label}
              </Text>
              <PressScale
                widthClass="narrow"
                accessibilityRole="button"
                accessibilityLabel={removeLabel(label)}
                onPress={() => onRemove(key)}
                style={styles.remove}
                testID={`chip-${key}-remove`}
              >
                <Text variant="label" color={ink}>
                  {CROSS}
                </Text>
              </PressScale>
            </View>
          );
        })}
      </View>
      {note === null ? null : (
        <GuideLine
          guide={guide}
          name={guideName}
          line={note}
          sticker={<GuideSticker guide={guide} />}
        />
      )}
    </View>
  );
}
