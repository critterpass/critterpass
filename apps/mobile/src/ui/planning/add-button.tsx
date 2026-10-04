/**
 * The yellow + that adds a place (7c-2, 7c-3, 7f-1): a round accent button with a hit target of
 * at least 44 pt.
 */
import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface AddButtonProps {
  /** What it adds, for screen readers ("Add Tirta Empul to the plan"). */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly size?: number | undefined;
  readonly testID?: string | undefined;
}

const PLUS = '+';

const useStyles = makeStyles((t) => ({
  target: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.action.primary,
  },
}));

export function AddButton({ accessibilityLabel, onPress, size = 36, testID }: AddButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      widthClass="narrow"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.target}
      testID={testID}
    >
      <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text variant="h3" color={theme.semantic.text.onAccent}>
          {PLUS}
        </Text>
      </View>
    </PressScale>
  );
}
