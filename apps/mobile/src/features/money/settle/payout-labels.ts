/** Payout method names as the chips and the payment screen show them. */
import type { PayoutKind } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useCallback } from 'react';

export function usePayoutKindLabel(): (kind: PayoutKind) => string {
  const { t } = useLingui();
  return useCallback(
    (kind: PayoutKind) => {
      switch (kind) {
        case 'bank':
          return t({ id: 'money.payout.bank', message: 'Bank transfer' });
        case 'paynow':
          return t({ id: 'money.payout.paynow', message: 'PayNow' });
        case 'promptpay':
          return t({ id: 'money.payout.promptpay', message: 'PromptPay' });
        case 'vietqr':
          return t({ id: 'money.payout.vietqr', message: 'VietQR' });
        case 'duitnow':
          return t({ id: 'money.payout.duitnow', message: 'DuitNow' });
        case 'wise_link':
          return t({ id: 'money.payout.wise', message: 'Wise' });
        case 'cash':
          return t({ id: 'money.payout.cash', message: 'Cash' });
      }
    },
    [t],
  );
}
