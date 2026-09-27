import { t } from '@lingui/core/macro';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion/use-loop';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface EmptySeatProps {
  /** Diameter. @default 44 */
  readonly size?: number;
  /** Invite someone into the seat. */
  readonly onPress?: () => void;
  /** Overrides "Empty seat". */
  readonly label?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  seat: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.control,
  },
}));

/** A dashed, gently pulsing empty seat in a crew (3a-13, 4f-1); tappable to invite. */
export function EmptySeat({ size = 44, onPress, label, testID }: EmptySeatProps) {
  const styles = useStyles();
  const theme = useTheme();
  const pulse = useLoop('pulse');
  const name = label ?? t({ id: 'common.emptySeat.label', message: 'Empty seat' });
  const face = (
    <Animated.View
      style={[styles.seat, { width: size, height: size, borderRadius: size / 2 }, pulse]}
    >
      <Text variant="title" color={theme.semantic.text.secondary}>
        +
      </Text>
    </Animated.View>
  );
  if (onPress) {
    return (
      <PressScale testID={testID} onPress={onPress} widthClass="narrow" accessibilityLabel={name}>
        {face}
      </PressScale>
    );
  }
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={name}>
      {face}
    </View>
  );
}
