/**
 * The chips across the top of a planning map or list (7a-1 DAY 3 · WED, SAVED 14; 7c-1 ALL 86,
 * IN THE PLAN 22; the search chips that can be taken off with ×). One row that scrolls sideways;
 * a chosen chip is filled (paper, or the day's colour for a day chip).
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface PlanningChip {
  readonly key: string;
  readonly label: string;
  readonly count?: number | undefined;
  readonly selected?: boolean | undefined;
  /** The fill when chosen; paper when absent. */
  readonly color?: string | undefined;
  /** Shows × to take the chip off (search filters). */
  readonly removable?: boolean | undefined;
}

export interface FilterChipRowProps {
  readonly chips: readonly PlanningChip[];
  readonly onPress?: ((key: string) => void) | undefined;
  readonly onRemove?: ((key: string) => void) | undefined;
  readonly testID?: string | undefined;
}

const CROSS = '×';

const useStyles = makeStyles((t) => ({
  row: { gap: t.space['8'], paddingHorizontal: t.size.gutter },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: sizeToken(t.size.chip, 'height') / 2,
  },
  label: {
    minHeight: sizeToken(t.size.chip, 'height'),
    justifyContent: 'center',
    paddingHorizontal: t.space['14'],
  },
  labelBeforeRemove: { paddingEnd: t.space['4'] },
  remove: {
    minHeight: sizeToken(t.size.chip, 'height'),
    minWidth: t.space['24'],
    justifyContent: 'center',
    paddingEnd: t.space['10'],
  },
}));

export function FilterChipRow({ chips, onPress, onRemove, testID }: FilterChipRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID={testID}
    >
      {chips.map((chip) => {
        const selected = chip.selected === true;
        const fill = selected ? (chip.color ?? theme.color.paper.base) : theme.semantic.bg.raised;
        const ink = !selected
          ? theme.semantic.text.primary
          : chip.color === undefined
            ? theme.color.paper.ink
            : theme.color.paper.bright;
        const words =
          chip.count === undefined ? chip.label : `${chip.label}, ${String(chip.count)}`;
        return (
          <View key={chip.key} style={[styles.chip, { backgroundColor: fill }]}>
            <PressScale
              widthClass="narrow"
              accessibilityRole="button"
              accessibilityLabel={words}
              accessibilityState={{ selected }}
              onPress={onPress === undefined ? undefined : () => onPress(chip.key)}
              style={[styles.label, chip.removable === true ? styles.labelBeforeRemove : null]}
              testID={`chip-${chip.key}`}
            >
              <Text variant="label" color={ink} numberOfLines={1}>
                {chip.count === undefined ? chip.label : `${chip.label} ${String(chip.count)}`}
              </Text>
            </PressScale>
            {chip.removable === true && onRemove !== undefined ? (
              <PressScale
                widthClass="narrow"
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: 'kit.filterChipRow.remove',
                  message: `Remove ${chip.label}`,
                })}
                onPress={() => onRemove(chip.key)}
                style={styles.remove}
                testID={`chip-${chip.key}-remove`}
              >
                <Text variant="label" color={ink}>
                  {CROSS}
                </Text>
              </PressScale>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
