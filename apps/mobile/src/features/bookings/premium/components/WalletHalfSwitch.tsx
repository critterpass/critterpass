/**
 * Bookings | Money under the Wallet title (7.01, 7.16): both halves are the tab's root, so the
 * switch swaps one for the other in place, with no push and no back.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { SegmentedControl, usePremiumTheme } from '@/ui/premium';

import { switchWalletHalf, type WalletHalf } from '../../stack/wallet-halves';

export function WalletHalfSwitch({ current }: { readonly current: WalletHalf }) {
  const { t } = useLingui();
  const theme = usePremiumTheme();
  return (
    <View style={{ paddingHorizontal: theme.space.gap16, paddingTop: theme.space.gap6 }}>
      <SegmentedControl<WalletHalf>
        accessibilityLabel={t({ id: 'bookings.switch.label', message: 'Wallet' })}
        options={[
          { value: 'bookings', label: t({ id: 'bookings.title', message: 'Bookings' }) },
          { value: 'money', label: t({ id: 'bookings.switch.money', message: 'Money' }) },
        ]}
        value={current}
        onChange={(half) => {
          if (half !== current) switchWalletHalf(half);
        }}
        testID="wallet-switch"
      />
    </View>
  );
}
