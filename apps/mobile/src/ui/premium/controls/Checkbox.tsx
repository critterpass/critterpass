import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { Icon } from '../icons/Icon';
import { hitSlopFor } from '../motion/PressableScale';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  /** What ticking it means ("Packed passport"). */
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}

/** The 22 pt round checkbox: ink with a white tick when on, a 2 pt grey ring when off. */
export function Checkbox({
  checked,
  onChange,
  accessibilityLabel,
  disabled,
  testID,
}: CheckboxProps) {
  const t = usePremiumTheme();
  const side = t.size.checkbox;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked, disabled: disabled === true }}
      disabled={disabled}
      hitSlop={hitSlopFor(side, side)}
      onPress={() => {
        void Haptics.selectionAsync();
        onChange(!checked);
      }}
      style={{ opacity: disabled === true ? t.opacity.disabled : 1 }}
    >
      <View
        style={{
          width: side,
          height: side,
          borderRadius: side / 2,
          alignItems: 'center',
          justifyContent: 'center',
          ...(checked
            ? { backgroundColor: t.color.ink }
            : { borderWidth: t.size.checkboxBorder, borderColor: t.color.outlineEmpty }),
        }}
      >
        {checked ? (
          <Icon name="check" size={t.size.checkboxGlyph} color={t.color.onInk} stroke={3.4} />
        ) : null}
      </View>
    </Pressable>
  );
}
