/**
 * The booking extraction contract. The model reads the confirmation's text and answers, per
 * booking, what it printed: codes, amounts and the cancellation policy exactly as written, times as
 * local wall-clock times with the zone of the place they happen in. Code then checks every value
 * that matters against the text itself: a confirmation code, a flight number, a price or a
 * cancellation policy the email does not print is dropped (and a deadline without its policy
 * goes with it), so an instruction hidden in the email cannot plant a value it never printed.
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  BOOKING_KINDS,
  localSchedule,
  type BookingSupplier,
  type ExtractedBooking,
  type FlightSegmentInput,
} from '@cp/domain';
import { z } from 'zod';

import { parsePrintedAmount } from '../receipt-parse/schema';

const nullable = (type: string) => ({ type: [type, 'null'] });

export const BOOKING_EXTRACT_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['bookings'],
    properties: {
      bookings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'kind',
            'title',
            'supplier_name',
            'confirmation_code',
            'starts_local',
            'ends_local',
            'timezone',
            'location',
            'price',
            'travellers',
            'free_cancel_until_local',
            'cancel_policy_text',
            'flights',
            'room',
            'meeting_point',
            'seat',
          ],
          properties: {
            kind: { type: 'string', enum: [...BOOKING_KINDS] },
            title: { type: 'string' },
            supplier_name: nullable('string'),
            confirmation_code: nullable('string'),
            starts_local: nullable('string'),
            ends_local: nullable('string'),
            timezone: nullable('string'),
            location: nullable('string'),
            price: {
              type: ['object', 'null'],
              additionalProperties: false,
              required: ['amount', 'currency'],
              properties: { amount: { type: 'string' }, currency: { type: 'string' } },
            },
            travellers: { type: 'array', items: { type: 'string' } },
            free_cancel_until_local: nullable('string'),
            cancel_policy_text: nullable('string'),
            flights: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'carrier',
                  'number',
                  'from',
                  'to',
                  'departs_local',
                  'departs_timezone',
                  'arrives_local',
                  'arrives_timezone',
                ],
                properties: {
                  carrier: { type: 'string' },
                  number: { type: 'string' },
                  from: { type: 'string' },
                  to: { type: 'string' },
                  departs_local: { type: 'string' },
                  departs_timezone: { type: 'string' },
                  arrives_local: nullable('string'),
                  arrives_timezone: nullable('string'),
                },
              },
            },
            room: nullable('string'),
            meeting_point: nullable('string'),
            seat: nullable('string'),
          },
        },
      },
    },
  },
};

const flightReply = z.object({
  carrier: z.string().max(8),
  number: z.string().max(8),
  from: z.string().max(8),
  to: z.string().max(8),
  departs_local: z.string().max(40),
  departs_timezone: z.string().max(64),
  arrives_local: z.string().max(40).nullable(),
  arrives_timezone: z.string().max(64).nullable(),
});

export const bookingExtractReplySchema = z.object({
  bookings: z
    .array(
      z.object({
        kind: z.enum(BOOKING_KINDS),
        title: z.string().max(300),
        supplier_name: z.string().max(200).nullable(),
        confirmation_code: z.string().max(100).nullable(),
        starts_local: z.string().max(40).nullable(),
        ends_local: z.string().max(40).nullable(),
        timezone: z.string().max(64).nullable(),
        location: z.string().max(500).nullable(),
        price: z.object({ amount: z.string().max(40), currency: z.string().max(8) }).nullable(),
        travellers: z.array(z.string().max(120)).max(32),
        free_cancel_until_local: z.string().max(40).nullable(),
        cancel_policy_text: z.string().max(3000).nullable(),
        flights: z.array(flightReply).max(8),
        room: z.string().max(200).nullable(),
        meeting_point: z.string().max(500).nullable(),
        seat: z.string().max(20).nullable(),
      }),
    )
    .max(8),
});
export type BookingExtractReply = z.infer<typeof bookingExtractReplySchema>;

export interface ValidateExtractionOptions {
  /** The seller the sender's domain names, when it does. */
  readonly supplier: BookingSupplier | null;
  /** ISO 4217 minor-unit exponent, or undefined for a currency the caller does not know. */
  readonly exponentOf: (currency: string) => number | undefined;
}

/** Whitespace-, case- and punctuation-insensitive text for "does the email print this". */
const loose = (text: string) => text.toLowerCase().replace(/[\s\u00A0.,:;'"’`()\-–—]+/gu, '');

function printed(haystack: string, needle: string): boolean {
  const probe = loose(needle);
  return probe.length > 0 && haystack.includes(probe);
}

function validTz(tz: string | null): string | null {
  if (tz === null || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2}$/u.test(tz)) return null;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** A local wall time (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`) in `tz` as an ISO instant. */
export function localInstant(local: string | null, tz: string | null): string | null {
  if (local === null || tz === null) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/u.exec(local.trim());
  if (match === null) return null;
  try {
    return localSchedule({ date: match[1] ?? '', time: match[2] ?? '00:00', tz }).toISOString();
  } catch {
    return null;
  }
}

function flightOf(flight: z.infer<typeof flightReply>, text: string): FlightSegmentInput | null {
  const carrier = flight.carrier.trim().toUpperCase();
  const number = flight.number
    .trim()
    .toUpperCase()
    .replace(/^([A-Z][A-Z0-9]|[0-9][A-Z])\s*(?=\d)/u, '')
    .replace(/^0+(?=\d)/u, '');
  const from = flight.from.trim().toUpperCase();
  const to = flight.to.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,3}$/u.test(carrier) || !/^[0-9]{1,4}[A-Z]?$/u.test(number)) return null;
  if (!/^[A-Z]{3}$/u.test(from) || !/^[A-Z]{3}$/u.test(to)) return null;
  // The flight must be printed: "SQ 938", "SQ938", "SQ 0938".
  const digits = new RegExp(`${carrier.toLowerCase()}0*${number.toLowerCase()}(?![0-9])`, 'u');
  if (!digits.test(text)) return null;
  const departs = localInstant(flight.departs_local, validTz(flight.departs_timezone));
  if (departs === null) return null;
  const arrives = localInstant(flight.arrives_local, validTz(flight.arrives_timezone));
  return {
    carrier,
    flight_no: number,
    dep_airport: from,
    arr_airport: to,
    sched_dep_at: departs,
    ...(arrives === null ? {} : { sched_arr_at: arrives }),
  };
}

/** The model's reply checked against the email text; bookings without a usable title drop out. */
export function validateExtraction(
  reply: BookingExtractReply,
  emailText: string,
  options: ValidateExtractionOptions,
): ExtractedBooking[] {
  const haystack = loose(emailText);
  const squashed = emailText.toLowerCase().replace(/[\s\u00A0-]+/gu, '');
  const bookings: ExtractedBooking[] = [];
  for (const booking of reply.bookings) {
    const title = booking.title.trim().slice(0, 140);
    if (title === '') continue;
    const tz = validTz(booking.timezone);
    const segments =
      booking.kind === 'flight'
        ? booking.flights
            .map((flight) => flightOf(flight, squashed))
            .filter((segment): segment is FlightSegmentInput => segment !== null)
        : [];
    if (booking.kind === 'flight' && segments.length === 0) continue;
    const code =
      booking.confirmation_code !== null && printed(haystack, booking.confirmation_code)
        ? booking.confirmation_code.trim().slice(0, 64)
        : null;
    const policy =
      booking.cancel_policy_text !== null && printed(haystack, booking.cancel_policy_text)
        ? booking.cancel_policy_text.trim().slice(0, 2000)
        : null;
    const currency = booking.price?.currency.trim().toUpperCase() ?? null;
    const exponent = currency === null ? undefined : options.exponentOf(currency);
    const amount =
      booking.price === null || exponent === undefined || !printed(haystack, booking.price.amount)
        ? null
        : parsePrintedAmount(booking.price.amount, exponent);
    const first = segments[0];
    const last = segments.at(-1);
    const details = {
      ...(booking.room === null ? {} : { room: booking.room.slice(0, 120) }),
      ...(booking.meeting_point === null
        ? {}
        : { meeting_point: booking.meeting_point.slice(0, 300) }),
      ...(booking.seat === null ? {} : { seat: booking.seat.slice(0, 8) }),
    };
    bookings.push({
      kind: booking.kind,
      title,
      supplier: options.supplier ?? (booking.kind === 'flight' ? 'airline' : 'other'),
      supplier_name: booking.supplier_name?.slice(0, 120) ?? null,
      supplier_ref: code,
      starts_at: first?.sched_dep_at ?? localInstant(booking.starts_local, tz),
      ends_at: last?.sched_arr_at ?? localInstant(booking.ends_local, tz),
      tz,
      location: booking.location?.slice(0, 300) ?? null,
      price:
        amount === null || amount < 0n || currency === null
          ? null
          : { amount_minor: Number(amount), currency },
      travellers: booking.travellers.map((name) => name.slice(0, 80)).slice(0, 32),
      free_cancel_until: policy === null ? null : localInstant(booking.free_cancel_until_local, tz),
      cancel_policy_text: policy,
      segments,
      details,
      barcode: null,
      extracted_by: 'model',
    });
  }
  return bookings;
}
