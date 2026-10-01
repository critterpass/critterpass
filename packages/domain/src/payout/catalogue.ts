/**
 * How members get paid back ("HOW PEOPLE PAY YOU"): the payout method kinds, which a payee in each
 * country is offered first, and the details each kind stores (encrypted, C3). Bank transfer, cash
 * and a Wise link work anywhere; PayNow, PromptPay, VietQR and DuitNow add a scannable QR in their
 * country. Details never leave the server except to the payer of an open payment to the payee.
 */
import { z } from 'zod';

import { toCountryCode } from '../countries/country-code';

export const PAYOUT_KINDS = [
  'bank',
  'paynow',
  'promptpay',
  'vietqr',
  'duitnow',
  'wise_link',
  'cash',
] as const;
export const payoutKindSchema = z.enum(PAYOUT_KINDS);
export type PayoutKind = z.infer<typeof payoutKindSchema>;

/** Kinds offered to a payee in each country, in chip order; everyone else gets the default. */
export const PAYOUT_CATALOGUE: Readonly<Record<string, readonly PayoutKind[]>> = {
  SG: ['bank', 'paynow', 'cash', 'wise_link'],
  TH: ['bank', 'promptpay', 'cash', 'wise_link'],
  VN: ['bank', 'vietqr', 'cash', 'wise_link'],
  MY: ['bank', 'duitnow', 'cash', 'wise_link'],
};
export const DEFAULT_PAYOUT_KINDS: readonly PayoutKind[] = ['bank', 'cash', 'wise_link'];

export function payoutKindsFor(country: string | null | undefined): readonly PayoutKind[] {
  const code = toCountryCode(country);
  return (code === null ? undefined : PAYOUT_CATALOGUE[code]) ?? DEFAULT_PAYOUT_KINDS;
}

/** The QR scheme a kind renders, when it has one. */
export const QR_PAYOUT_KINDS: ReadonlySet<PayoutKind> = new Set([
  'paynow',
  'promptpay',
  'vietqr',
  'duitnow',
]);

const text = (max: number) => z.string().trim().min(1).max(max);

export const PAYOUT_DETAILS_SCHEMAS = {
  bank: z.strictObject({
    bank_name: text(80),
    account_name: text(80),
    account_number: text(40),
    swift: z
      .string()
      .regex(/^[A-Z0-9]{8,11}$/u)
      .optional(),
    branch: text(80).optional(),
  }),
  paynow: z.strictObject({
    proxy_type: z.enum(['mobile', 'uen']),
    proxy: z.string().regex(/^(\+65\d{8}|[0-9A-Z]{9,10})$/u),
    name: text(25),
  }),
  promptpay: z.strictObject({
    proxy_type: z.enum(['mobile', 'national_id', 'ewallet']),
    proxy: z.string().regex(/^[+\d]{9,15}$/u),
    name: text(25).optional(),
  }),
  vietqr: z.strictObject({
    bank_bin: z.string().regex(/^\d{6}$/u),
    account_number: z.string().regex(/^[0-9A-Za-z]{4,19}$/u),
    account_name: text(50).optional(),
  }),
  duitnow: z.strictObject({
    acquirer_id: z.string().regex(/^[0-9A-Z]{6,11}$/u),
    account_number: z.string().regex(/^[0-9A-Za-z]{4,25}$/u),
    name: text(25),
  }),
  wise_link: z.strictObject({
    url: z.url().refine((url) => /^https:\/\/wise\.com\//u.test(url), 'a wise.com link'),
  }),
  cash: z.strictObject({}),
} as const satisfies Record<PayoutKind, z.ZodType>;

export type PayoutDetails<K extends PayoutKind = PayoutKind> = z.infer<
  (typeof PAYOUT_DETAILS_SCHEMAS)[K]
>;

export const setPayoutMethodPayloadSchema = z.strictObject({
  kind: payoutKindSchema,
  country: z
    .string()
    .regex(/^[A-Z]{2}$/u)
    .optional(),
  /** Checked against the kind's schema by the command; ignored when removing. */
  details: z.record(z.string(), z.unknown()).default({}),
  /** Removes the member's method of this kind. */
  remove: z.boolean().default(false),
});
export type SetPayoutMethodPayload = z.infer<typeof setPayoutMethodPayloadSchema>;

/** Validates `details` against its kind; the caller gets the typed details or a zod error. */
export function parsePayoutDetails(kind: PayoutKind, details: unknown): PayoutDetails {
  return PAYOUT_DETAILS_SCHEMAS[kind].parse(details);
}

/** What the payer sees: the kind, the payee's label and, after the reveal, the details. */
export interface RevealedPayoutMethod {
  readonly method_id: string;
  readonly kind: PayoutKind;
  readonly country: string | null;
  readonly label: string;
  readonly details: PayoutDetails;
}
