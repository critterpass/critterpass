/**
 * The note that closes "How much we ping" (5b-4): what gets through whatever the budget says,
 * and under it whatever the phone's own settings still hold back from those (on Android: alarms
 * on time and full screen, SOS through Do Not Disturb, Live Updates).
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((t) => ({
  always: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['4'],
  },
}));

export function AlwaysNote({ children }: { readonly children?: ReactNode }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.always} testID="you-pings-always">
      <Text variant="eyebrow" color={theme.color.orange}>
        {t({ id: 'you.pings.always', message: 'Always gets through' })}
      </Text>
      <Text variant="body">
        {t({
          id: 'you.pings.alwaysLine',
          message:
            'Leave-by alarms, SOS, flight changes and anything that costs money if you miss it.',
        })}
      </Text>
      {children}
    </View>
  );
}
