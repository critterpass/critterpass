/**
 * The payee's revealed payout method as a scannable EMVCo payload (PayNow, PromptPay, VietQR,
 * DuitNow), built from their own entered details. The amount is filled in when the payment is in
 * the scheme's own currency; otherwise the payer types it in their bank app.
 */
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import {
  duitNowQr,
  parsePayoutDetails,
  payNowQr,
  promptPayQr,
  vietQr,
  type PayoutDetails,
  type RevealedPayoutMethod,
} from '@cp/domain';

const SCHEME_CURRENCY: Readonly<Record<string, string>> = {
  paynow: 'SGD',
  promptpay: 'THB',
  vietqr: 'VND',
  duitnow: 'MYR',
};

export interface PayoutQr {
  readonly payload: string;
  /** False when the payer must type the amount in their bank app. */
  readonly withAmount: boolean;
}

export function payoutQr(
  method: RevealedPayoutMethod,
  amountMinor: bigint,
  currency: string,
): PayoutQr | null {
  const scheme = SCHEME_CURRENCY[method.kind];
  if (scheme === undefined) return null;
  let details: PayoutDetails;
  try {
    details = parsePayoutDetails(method.kind, method.details);
  } catch {
    return null;
  }
  const withAmount = currency === scheme && isKnownCurrency(currency) && amountMinor > 0n;
  const amount = withAmount ? { amountMinor, exponent: currencyExponent(currency) } : undefined;
  const opt = amount === undefined ? {} : { amount };
  switch (method.kind) {
    case 'paynow': {
      const d = details as PayoutDetails<'paynow'>;
      return {
        payload: payNowQr({ proxyType: d.proxy_type, proxy: d.proxy, name: d.name, ...opt }),
        withAmount,
      };
    }
    case 'promptpay': {
      const d = details as PayoutDetails<'promptpay'>;
      return {
        payload: promptPayQr({ proxyType: d.proxy_type, proxy: d.proxy, ...opt }),
        withAmount,
      };
    }
    case 'vietqr': {
      const d = details as PayoutDetails<'vietqr'>;
      return {
        payload: vietQr({ bankBin: d.bank_bin, accountNumber: d.account_number, ...opt }),
        withAmount,
      };
    }
    case 'duitnow': {
      const d = details as PayoutDetails<'duitnow'>;
      return {
        payload: duitNowQr({
          acquirerId: d.acquirer_id,
          accountNumber: d.account_number,
          name: d.name,
          ...opt,
        }),
        withAmount,
      };
    }
    case 'bank':
    case 'cash':
    case 'wise_link':
      return null;
  }
}
