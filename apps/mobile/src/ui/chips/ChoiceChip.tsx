import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface ChoiceChipProps {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  /** Accent of the selected fill and outer ring; defaults to the primary action yellow. */
  readonly accent?: string;
  /** Resting tilt in degrees; alternate signs across a row for the hand-placed look. @default -2 */
  readonly tilt?: number;
  readonly disabled?: boolean;
  /** The `tick` a tap fires; off for a host that answers with its own cue. @default true */
  readonly feedback?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  outer: { borderRadius: 999, borderWidth: 0, padding: 0 },
  chip: {
    minHeight: sizeToken(t.size.chip, 'height'),
    borderRadius: sizeToken(t.size.chip, 'height') / 2,
    paddingHorizontal: t.space['14'],
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.control,
  },
  target: { justifyContent: 'center', alignItems: 'flex-start' },
}));

/**
 * A tilted answer chip (onboarding travel style, moods). Selected: accent fill inside the
 * `ring.selected` double ring (3 pt ink gap, 2 pt accent outer) and the tilt straightens.
 */
export function ChoiceChip({
  label,
  selected,
  onPress,
  accent,
  tilt = -2,
  disabled = false,
  feedback = true,
  testID,
}: ChoiceChipProps) {
  const styles = useStyles();
  const theme = useTheme();
  const fill = accent ?? theme.semantic.action.primary;
  const { inner, outer } = theme.ring.selected;
  return (
    <PressScale
      testID={testID}
      onPress={onPress}
      feedback={feedback ? 'tick' : undefined}
      disabled={disabled}
      widthClass="narrow"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.target, { transform: [{ rotate: `${selected ? 0 : tilt}deg` }] }]}
    >
      <View
        style={
          selected ? [styles.outer, { borderWidth: outer.widthPt, borderColor: fill }] : undefined
        }
      >
        <View
          style={
            selected
              ? [styles.outer, { borderWidth: inner.widthPt, borderColor: inner.color ?? fill }]
              : undefined
          }
        >
          <View style={[styles.chip, selected ? { backgroundColor: fill } : null]}>
            <Text
              variant="label"
              color={selected ? theme.semantic.text.onAccent : theme.color.ink[100]}
            >
              {label}
            </Text>
          </View>
        </View>
      </View>
    </PressScale>
  );
}
