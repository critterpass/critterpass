/** The confirm circle of a card line (6c-2): dashed until confirmed, then a green tick. */
import { useLingui } from '@lingui/react/macro';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

/** The circle's width, for a line that has nothing to confirm. */
export const CHECK_DOT_SIZE = 28;

const DOT = {
  width: CHECK_DOT_SIZE,
  height: CHECK_DOT_SIZE,
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
