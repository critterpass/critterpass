/** The confirm circle of a card line (6c-2): a dashed ring until confirmed, then a green tick. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { useTheme } from '@/ui/theme';

const SIZE = 24;
/** Sets the ring level with the middle of a line's label and value. */
const TOP = 6;
const DOT = {
  width: SIZE,
  height: SIZE,
  borderRadius: SIZE / 2,
  borderWidth: 2,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

/** Without `onPress` the ring only marks the line as unconfirmed (nothing to tick yet). */
export function CheckDot({
  on,
  onPress,
}: {
  readonly on: boolean;
  readonly onPress?: (() => void) | undefined;
}) {
  const theme = useTheme();
  const { t } = useLingui();
  const ring = (
    <View
      style={[
        DOT,
        on
          ? { backgroundColor: theme.color.green.base, borderColor: theme.color.green.base }
          : { borderColor: theme.semantic.text.secondary, borderStyle: 'dashed' },
      ]}
    >
      {on ? <Icon name="check" size={12} color={theme.semantic.text.onAccent} decorative /> : null}
    </View>
  );
  if (onPress === undefined) {
    return (
      <View
        style={{ marginTop: TOP }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {ring}
      </View>
    );
  }
  return (
    <PressScale
      accessibilityLabel={t({ id: 'drivers.check.confirmLine', message: 'Confirm this line' })}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      // The ring is drawn at its own size; the press target grows around it as touch slop.
      style={{ width: SIZE, height: SIZE, minWidth: SIZE, minHeight: SIZE, marginTop: TOP }}
    >
      {ring}
    </PressScale>
  );
}
