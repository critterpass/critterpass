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

/** The label over each payout field ("Account number", "Name the payer sees"). */
export function usePayoutFieldLabel(): (field: string) => string {
  const { t } = useLingui();
  return (field: string): string => {
    switch (field) {
      case 'bank_name':
        return t({ id: 'money.payout.field.bank', message: 'Bank' });
      case 'account_name':
        return t({ id: 'money.payout.field.accountName', message: 'Name on the account' });
      case 'account_number':
        return t({ id: 'money.payout.field.account', message: 'Account number' });
      case 'swift':
        return t({ id: 'money.payout.field.swift', message: 'SWIFT code (optional)' });
      case 'proxy':
        return t({ id: 'money.payout.field.mobile', message: 'Mobile number' });
      case 'name':
        return t({ id: 'money.payout.field.name', message: 'Name the payer sees' });
      case 'bank_bin':
        return t({ id: 'money.payout.field.bin', message: 'Bank code (6 digits)' });
      case 'acquirer_id':
        return t({ id: 'money.payout.field.acquirer', message: 'Bank id' });
      default:
        return t({ id: 'money.payout.field.link', message: 'Wise link' });
    }
  };
}
