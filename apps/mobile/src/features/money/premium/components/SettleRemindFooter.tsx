/**
 * Settle up's "Remind everyone" (7.24), pinned under the payments and clear of the home indicator;
 * offline it says the reminders wait for a connection.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, usePremiumTheme } from '@/ui/premium';

import type { SettleState } from '../../settle/use-settle';

export function SettleRemindFooter({
  settle,
}: {
  readonly settle: Extract<SettleState, { kind: 'ready' }>;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingHorizontal: th.space.titleGutter,
        paddingTop: th.space.gap8,
        // A little room over the home indicator, not flush on it.
        paddingBottom: insets.bottom > 0 ? insets.bottom + th.space.gap6 : th.space.gap12,
        gap: th.space.gap8,
      }}
    >
      <Button
        label={t({ id: 'money.settle.remind', message: 'Remind everyone' })}
        disabled={!settle.canRemind || settle.offline}
        loading={settle.reminding}
        onPress={settle.onRemind}
        testID="money-settle-remind"
      />
      {settle.offline ? (
        <Text variant="caption" tone="muted" align="center">
          {t({
            id: 'money.premium.remindOffline',
            message: 'Reminders go out when you’re back online.',
          })}
        </Text>
      ) : null}
    </View>
  );
}
