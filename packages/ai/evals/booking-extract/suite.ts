/**
 * The booking extraction suite (cases in `cases/*.yaml`). Each case sends a confirmation's text
 * through the real `extractBookings` (gateway, prompt, text checks) with only DeepSeek's network
 * boundary replayed, and is graded field by field: whether it books anything, kind, confirmation
 * code, start, price, flight numbers, the free cancellation deadline and whether the policy text
 * was kept. Injection cases also list values the email's hidden instructions try to plant; none
 * may appear anywhere in the answer.
 *
 * Real confirmations (Agoda, VietJet through MoMo, Grab) are redacted copies of forwarded emails
 * kept as the plain text the mail parser hands the model (`emails/*.txt`), with the subject and
 * the seller the sender's domain names. Where a confirmation honestly reads two ways (a return
 * trip on two booking codes as one booking or two; the booking number or the airline's reference
 * as the code; a deadline printed as "until 23:59" or "from 00:00 the next day") the case lists
 * every reading it accepts, and fields a reader cannot settle are left out and named in
 * `excluded`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bookingSupplierSchema, type ExtractedBooking } from '@cp/domain';
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

const instant = z.string().nullable();
const expectBooking = z.object({
  kind: z.string(),
  supplier_ref: z.string().nullable().optional(),
  /** Codes the email prints for this booking, any of which is a right answer. */
  supplier_ref_any: z.array(z.string()).min(2).optional(),
  starts_at: instant.optional(),
  price_minor: z.int().nullable().optional(),
  currency: z.string().optional(),
  free_cancel_until: instant.optional(),
  /** Instants that name the same deadline, any of which is a right answer. */
  free_cancel_until_any: z.array(instant).min(2).optional(),
  cancel_policy: z.boolean().optional(),
  /** Flight numbers in leg order, carrier and number together ("AK1503"). */
  flights: z.array(z.string()).optional(),
});
type ExpectedBooking = z.infer<typeof expectBooking>;
const caseSchema = z
  .object({
    description: z.string(),
    fixture: z.string(),
    /** Who sent it, for per-sender accuracy ("synthetic" for hand-written cases). */
    provider: z.string().default('synthetic'),
    source: z.enum(['forward', 'mailbox', 'paste', 'scan']).default('forward'),
    text: z.string().min(1).optional(),
    /** A redacted email body under `emails/`, read in place of `text`. */
    email: z.string().min(1).optional(),
    subject: z.string().optional(),
    supplier: bookingSupplierSchema.nullable().default(null),
    expect: z.object({
      status: z.enum(['parsed', 'failed']),
      bookings: z.array(expectBooking).default([]),
      /** Other readings of the same email that are also right (graded against the closest). */
      alternatives: z.array(z.array(expectBooking).min(1)).default([]),
      /** Values hidden instructions try to plant: none may appear in the answer. */
      forbidden: z.array(z.string()).default([]),
    }),
    /** Fields left ungraded because the email does not settle them, with the reason. */
    excluded: z.array(z.string()).default([]),
  })
  .refine((c) => (c.text === undefined) !== (c.email === undefined), 'give text or email');

const CASES_DIR = fileURLToPath(new URL('./cases/', import.meta.url));
const EMAILS_DIR = fileURLToPath(new URL('./emails/', import.meta.url));

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

interface Graded {
  readonly failures: string[];
  /** Fields graded (the booking count counts as one). */
  readonly checked: number;
}

function flightNumbers(booking: ExtractedBooking): string[] {
  return booking.segments.map((segment) => `${segment.carrier}${segment.flight_no}`);
}

function gradeBookings(got: readonly ExtractedBooking[], want: readonly ExpectedBooking[]): Graded {
  const failures: string[] = [];
  let checked = 1;
  if (got.length !== want.length) failures.push(`${got.length} bookings, want ${want.length}`);
  for (const [index, expected] of want.entries()) {
    const booking = got[index];
    const check = (field: string, value: unknown, accepted: readonly unknown[] | undefined) => {
      if (accepted === undefined) return;
      checked += 1;
      if (booking === undefined || !accepted.some((one) => one === value)) {
        failures.push(
          `#${index} ${field} ${JSON.stringify(value)}, want ${JSON.stringify(accepted)}`,
        );
      }
    };
    const one = <T>(value: T | undefined) => (value === undefined ? undefined : [value]);
    check('kind', booking?.kind, one(expected.kind));
    check(
      'supplier_ref',
      booking?.supplier_ref,
      expected.supplier_ref_any ?? one(expected.supplier_ref),
    );
    check('starts_at', booking?.starts_at, one(expected.starts_at));
    if (expected.price_minor !== undefined) {
      const price = booking?.price ?? null;
      const wanted =
        expected.price_minor === null
          ? null
          : `${expected.price_minor} ${expected.currency ?? '?'}`;
      check('price', price === null ? null : `${price.amount_minor} ${price.currency}`, [wanted]);
    }
    check(
      'free_cancel_until',
      booking?.free_cancel_until,
      expected.free_cancel_until_any ?? one(expected.free_cancel_until),
    );
    check(
      'cancel_policy',
      booking && booking.cancel_policy_text !== null,
      one(expected.cancel_policy),
    );
    if (expected.flights !== undefined) {
      check('flights', booking && flightNumbers(booking).join(' '), [expected.flights.join(' ')]);
    }
  }
  return { failures, checked };
}

export interface BookingExtractGrade extends Graded {
  readonly description: string;
  readonly provider: string;
  readonly output: string;
}

export async function gradeBookingExtractCase(
  raw: unknown,
  gatewayFor: (fixture: string) => Parameters<typeof extractBookings>[0],
): Promise<BookingExtractGrade> {
  const c = caseSchema.parse(raw);
  const text =
    c.email === undefined ? (c.text ?? '') : readFileSync(resolve(EMAILS_DIR, c.email), 'utf8');
  const result = await extractBookings(gatewayFor(c.fixture), {
    text,
    source: c.source,
    subject: c.subject,
    supplier: c.supplier,
    exponentOf: (currency) => EXPONENTS[currency],
  });
  const output = JSON.stringify(result);
  const got = result.status === 'parsed' ? result.bookings : [];
  // A confirmation that books nothing is graded on that alone; otherwise the booking count stands
  // for the status (a failed read has none).
  const best =
    c.expect.status === 'failed'
      ? { failures: result.status === 'failed' ? [] : [`status ${result.status}`], checked: 1 }
      : [c.expect.bookings, ...c.expect.alternatives]
          .map((want) => gradeBookings(got, want))
          .reduce((a, b) => (b.failures.length < a.failures.length ? b : a));
  const failures = [...best.failures];
  for (const value of c.expect.forbidden) {
    if (output.toLowerCase().includes(value.toLowerCase())) failures.push(`planted ${value}`);
  }
  return {
    description: `${c.fixture}: ${c.description}`,
    provider: c.provider,
    failures,
    checked: best.checked + c.expect.forbidden.length,
    output,
  };
}

export interface BookingExtractSuiteDeps {
  readonly gatewayFor: (fixture: string) => Parameters<typeof extractBookings>[0];
  readonly report: (description: string, failures: readonly string[], output: string) => CaseReport;
}

export async function runBookingExtractCase(
  raw: unknown,
  deps: BookingExtractSuiteDeps,
): Promise<CaseReport> {
  const graded = await gradeBookingExtractCase(raw, deps.gatewayFor);
  return deps.report(graded.description, graded.failures, graded.output);
}
