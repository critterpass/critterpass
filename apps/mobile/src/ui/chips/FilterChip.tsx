import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface FilterChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  /** Result count after the label ("Food 12"). */
  readonly count?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  target: { justifyContent: 'center', alignItems: 'flex-start' },
  chip: {
    flexDirection: 'row',
    gap: t.space['6'],
    alignItems: 'center',
    minHeight: sizeToken(t.size.chip, 'height'),
    borderRadius: sizeToken(t.size.chip, 'height') / 2,
    paddingHorizontal: t.space['12'],
    borderWidth: 1.5,
    borderColor: t.semantic.border.control,
  },
  on: { backgroundColor: t.color.paper.base, borderColor: t.color.paper.base },
}));

/** A list/map filter toggle; selected fills paper with ink text. */
export function FilterChip({ label, selected, onPress, count, testID }: FilterChipProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      widthClass="narrow"
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      accessibilityState={{ selected }}
      style={styles.target}
    >
      <View style={[styles.chip, selected ? styles.on : null]}>
        <Text variant="label" color={selected ? theme.color.ink[850] : theme.color.ink[100]}>
          {label}
        </Text>
        {count !== undefined ? (
          <Text
            variant="label"
            color={selected ? theme.color.ink[600] : theme.semantic.text.secondary}
          >
            {String(count)}
          </Text>
        ) : null}
      </View>
    </PressScale>
  );
}
