/**
 * BOOKINGS | MONEY at the top of both halves of the Wallet tab. Undesigned: the shared segmented
 * control, which swaps one half for the other in place without a transition (see wallet-halves).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Segmented } from '@/ui/inputs/Segmented';

import { switchWalletHalf, type WalletHalf } from './wallet-halves';

export type { WalletHalf } from './wallet-halves';

export function WalletSwitch({ current }: { readonly current: WalletHalf }) {
  const { t } = useLingui();
  const locale = useLocale();
  // Both halves are the Wallet tab's root, drawn without a back (3i-1): the switch and the tab bar
  // are the way around, even when a link pushed Bookings over Money.
  useNoBackByDesign();
  return (
    <Segmented<WalletHalf>
      label={t({ id: 'bookings.switch.label', message: 'Wallet' })}
      segments={[
        {
          value: 'bookings',
          label: upper(t({ id: 'bookings.title', message: 'Bookings' }), locale),
        },
        {
          value: 'money',
          label: upper(t({ id: 'bookings.switch.money', message: 'Money' }), locale),
        },
      ]}
      value={current}
      onChange={(half) => {
        if (half !== current) switchWalletHalf(half);
      }}
      testID="wallet-switch"
    />
  );
}
