/** The confirm circle of a card line (6c-2): dashed until confirmed, then a green tick. */
import { useLingui } from '@lingui/react/macro';

import { View } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

const DOT = {
  width: 28,
  height: 28,
  borderRadius: 14,
  borderWidth: 2,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

export function CheckDot({ on, onPress }: { readonly on: boolean; readonly onPress: () => void }) {
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <PressScale
      accessibilityLabel={t({ id: 'drivers.check.confirmLine', message: 'Confirm this line' })}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[
        DOT,
        on
          ? { backgroundColor: theme.color.green.base, borderColor: theme.color.green.base }
          : { borderColor: theme.semantic.border.control, borderStyle: 'dashed' },
      ]}
    >
      {on ? (
        <Text variant="label" color={theme.color.ink['950']}>
          ✓
        </Text>
      ) : null}
    </PressScale>
  );
}

const nothing = () => undefined;

/** The room a confirm circle takes, for a line that has nothing to confirm yet. */
export function CheckDotSpace() {
  return (
    <View
      style={{ opacity: 0 }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <CheckDot on={false} onPress={nothing} />
    </View>
  );
}
