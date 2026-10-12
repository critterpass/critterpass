/**
 * The fields each payout kind asks for and the check that runs before a save: the same schema the
 * server applies, so a method the editor sends is one the server takes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- field names are wire values. */
import { PAYOUT_DETAILS_SCHEMAS, type PayoutKind } from '@cp/domain';

/** The text fields each kind asks for, in order (the proxy type fields are picked, not typed). */
export const PAYOUT_FIELDS: Readonly<Record<PayoutKind, readonly string[]>> = {
  bank: ['bank_name', 'account_name', 'account_number', 'swift'],
  paynow: ['proxy', 'name'],
  promptpay: ['proxy', 'name'],
  vietqr: ['bank_bin', 'account_number', 'account_name'],
  duitnow: ['acquirer_id', 'account_number', 'name'],
  wise_link: ['url'],
  cash: [],
};

/** The details to send, or null while they do not pass the kind's schema. */
export function validDetails(
  kind: PayoutKind,
  values: Readonly<Record<string, string>>,
): Record<string, string> | null {
  const details: Record<string, string> = {};
  for (const field of PAYOUT_FIELDS[kind]) {
    const value = values[field]?.trim() ?? '';
    if (value !== '') details[field] = value;
  }
  if (kind === 'paynow' || kind === 'promptpay') details['proxy_type'] = 'mobile';
  return PAYOUT_DETAILS_SCHEMAS[kind].safeParse(details).success ? details : null;
}
