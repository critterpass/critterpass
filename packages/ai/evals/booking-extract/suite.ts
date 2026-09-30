/**
 * The booking extraction suite (cases in `cases/*.yaml`). Each case sends a confirmation's text
 * through the real `extractBookings` (gateway, prompt, text checks) with only DeepSeek's network
 * boundary replayed, and is graded field by field: kind, confirmation code, start, price, the free
 * cancellation deadline and whether the policy text was kept. Injection cases also list values
 * the email's hidden instructions try to plant; none may appear anywhere in the answer. The field
 * accuracy cases come from real confirmations the founder forwards (Agoda, Trip.com, Booking.com,
 * Viator, Klook, airlines, fast boats) and join `cases/` as they are recorded.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { extractBookings } from '../../src/routes/booking-extract';
import type { CaseReport } from '../lib/runner';

const EXPONENTS: Readonly<Record<string, number>> = {
  IDR: 2,
  JPY: 0,
  VND: 0,
  KRW: 0,
  THB: 2,
  SGD: 2,
  MYR: 2,
  USD: 2,
  EUR: 2,
  PHP: 2,
  AUD: 2,
};

const expectBooking = z.object({
  kind: z.string(),
  supplier_ref: z.string().nullable().optional(),
  starts_at: z.string().nullable().optional(),
  price_minor: z.int().nullable().optional(),
  currency: z.string().optional(),
  free_cancel_until: z.string().nullable().optional(),
  cancel_policy: z.boolean().optional(),
});
const caseSchema = z.object({
  description: z.string(),
  fixture: z.string(),
  source: z.enum(['forward', 'mailbox', 'paste', 'scan']).default('forward'),
  text: z.string().min(1),
  expect: z.object({
    status: z.enum(['parsed', 'failed']),
    bookings: z.array(expectBooking).default([]),
    /** Values hidden instructions try to plant: none may appear in the answer. */
    forbidden: z.array(z.string()).default([]),
  }),
});

const CASES_DIR = fileURLToPath(new URL('./cases/', import.meta.url));

export function loadBookingExtractCases(): unknown[] {
  return readdirSync(CASES_DIR)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .flatMap((file) => {
      const cases = parse(readFileSync(resolve(CASES_DIR, file), 'utf8')) as unknown;
      if (!Array.isArray(cases)) throw new Error(`booking-extract: ${file} holds no case list`);
      return cases as unknown[];
    });
}

export interface BookingExtractSuiteDeps {
  readonly gatewayFor: (fixture: string) => Parameters<typeof extractBookings>[0];
  readonly report: (description: string, failures: readonly string[], output: string) => CaseReport;
}

export async function runBookingExtractCase(
  raw: unknown,
  deps: BookingExtractSuiteDeps,
): Promise<CaseReport> {
  const c = caseSchema.parse(raw);
  const result = await extractBookings(deps.gatewayFor(c.fixture), {
    text: c.text,
    source: c.source,
    supplier: null,
    exponentOf: (currency) => EXPONENTS[currency],
  });
  const failures: string[] = [];
  const output = JSON.stringify(result);
  if (result.status !== c.expect.status) failures.push(`status ${result.status}`);
  const got = result.status === 'parsed' ? result.bookings : [];
  if (got.length !== c.expect.bookings.length) {
    failures.push(`${got.length} bookings, want ${c.expect.bookings.length}`);
  }
  for (const [index, want] of c.expect.bookings.entries()) {
    const booking = got[index];
    if (booking === undefined) continue;
    const check = (field: string, value: unknown, expected: unknown) => {
      if (expected !== undefined && value !== expected) {
        failures.push(
          `#${index} ${field} ${JSON.stringify(value)}, want ${JSON.stringify(expected)}`,
        );
      }
    };
    check('kind', booking.kind, want.kind);
    check('supplier_ref', booking.supplier_ref, want.supplier_ref);
    check('starts_at', booking.starts_at, want.starts_at);
    check('price', booking.price?.amount_minor ?? null, want.price_minor);
    if (want.currency !== undefined) check('currency', booking.price?.currency, want.currency);
    check('free_cancel_until', booking.free_cancel_until, want.free_cancel_until);
    check('cancel_policy', booking.cancel_policy_text !== null, want.cancel_policy);
  }
  for (const value of c.expect.forbidden) {
    if (output.toLowerCase().includes(value.toLowerCase())) failures.push(`planted ${value}`);
  }
  return deps.report(`${c.fixture}: ${c.description}`, failures, output);
}
