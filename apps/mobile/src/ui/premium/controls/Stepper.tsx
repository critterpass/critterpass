import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { Icon } from '../icons/Icon';
import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import type { StepperBounds } from './control-logic';
import { stepperCan, stepValue } from './control-logic';

export interface StepperProps extends StepperBounds {
  readonly value: number;
  readonly onChange: (next: number) => void;
  /** What it counts ("Nights"); assistive tech reads it with the value. */
  readonly accessibilityLabel: string;
  /** The spoken value when the number alone is unclear ("6 nights"). */
  readonly accessibilityValueText?: string;
  readonly testID?: string;
}

/** The 40-high − value + stepper on the control fill; each side is a 44-wide tap target. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  accessibilityLabel,
  accessibilityValueText,
  testID,
}: StepperProps) {
  const t = usePremiumTheme();
  const bounds = { min, max, ...(step === undefined ? {} : { step }) };
  const can = stepperCan(value, bounds);
  const move = (direction: 1 | -1) => {
    const next = stepValue(value, direction, bounds);
    if (next === value) return;
    void Haptics.selectionAsync();
    onChange(next);
  };

  const side = (direction: 1 | -1, enabled: boolean) => (
    <Pressable
      accessible={false}
      importantForAccessibility="no"
      testID={testID === undefined ? undefined : `${testID}-${direction === 1 ? 'up' : 'down'}`}
      disabled={!enabled}
      onPress={() => move(direction)}
      style={{
        width: t.size.stepperButton,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: enabled ? 1 : t.opacity.disabled,
      }}
    >
      <Icon name={direction === 1 ? 'plus' : 'minus'} size={t.size.glyph} stroke={2} />
    </Pressable>
  );

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        accessibilityValueText === undefined
          ? { min, max, now: value }
          : { min, max, now: value, text: accessibilityValueText }
      }
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => move(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{
        height: t.size.stepper,
        borderRadius: t.radius.pill,
        backgroundColor: t.color.control,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
      }}
    >
      {side(-1, can.decrement)}
      <Text
        variant="stepperValue"
        align="center"
        style={{ minWidth: t.size.stepperValue }}
        numberOfLines={1}
      >
        {String(value)}
      </Text>
      {side(1, can.increment)}
    </View>
  );
}
