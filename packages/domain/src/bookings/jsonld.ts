/**
 * schema.org reservation markup (the JSON-LD and microdata airlines, Agoda, Booking.com and ticket
 * sellers put in confirmation emails) read into typed bookings without a model call. Flight legs
 * sharing a reservation number become one booking with several segments. A time printed without an
 * offset is read in `defaultTz` (the trip's zone) when one is known; otherwise it is left empty for
 * the traveller to fill. Prices are converted with the caller's currency exponent table; a price in
 * a currency it does not know is left out rather than guessed.
 */
import { localSchedule } from '../time/local-schedule';
import { emptyExtraction, type ExtractedBooking } from './extracted';
import type { BookingKind } from './kinds';
import type { MicrodataReservation } from './sanitize';
import type { BookingSupplier } from './kinds';

export interface MarkupOptions {
  /** The trip's zone, for times printed without an offset. */
  readonly defaultTz: string | null;
  /** ISO 4217 minor-unit exponent, or undefined for a currency the caller does not know. */
  readonly exponentOf: (currency: string) => number | undefined;
  /** The seller the email came from, when the sender's domain says so. */
  readonly supplier: BookingSupplier;
}

type Json = Record<string, unknown>;

const KIND_OF_TYPE: Readonly<Record<string, BookingKind>> = {
  FlightReservation: 'flight',
  LodgingReservation: 'stay',
  EventReservation: 'activity',
  FoodEstablishmentReservation: 'activity',
  TrainReservation: 'rail',
  BusReservation: 'transfer',
  TaxiReservation: 'transfer',
  BoatReservation: 'boat',
  RentalCarReservation: 'car',
};

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function typeOf(node: Json): string {
  const type = node['@type'];
  return typeof (Array.isArray(type) ? type[0] : type) === 'string'
    ? String(Array.isArray(type) ? type[0] : type).replace(/^https?:\/\/schema\.org\//u, '')
    : '';
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number') return String(value);
  if (isObject(value)) return text(value['name']) ?? text(value['@value']);
  return null;
}

function at(node: unknown, key: string): unknown {
  return isObject(node) ? node[key] : undefined;
}

/** An instant with offset; a wall time without one read in `tz`; otherwise null. */
export function instantOf(value: unknown, tz: string | null): string | null {
  const raw = text(value);
  if (raw === null) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/u.test(raw)) {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const wall = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/u.exec(raw);
  if (wall === null || tz === null) return null;
  try {
    return localSchedule({ date: wall[1] ?? '', time: wall[2] ?? '00:00', tz }).toISOString();
  } catch {
    return null;
  }
}

function addressOf(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (!isObject(value)) return null;
  const parts = ['streetAddress', 'addressLocality', 'addressRegion', 'addressCountry']
    .map((key) => text(value[key]))
    .filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(', ').slice(0, 300);
}

function priceOf(node: Json, options: MarkupOptions): ExtractedBooking['price'] {
  const spec = node['totalPrice'] ?? node['price'];
  const amount = isObject(spec) ? (spec['price'] ?? spec['value']) : spec;
  const currency = text(node['priceCurrency'] ?? at(spec, 'priceCurrency'))?.toUpperCase() ?? null;
  if (currency === null || !/^[A-Z]{3}$/u.test(currency)) return null;
  const exponent = options.exponentOf(currency);
  const value =
    typeof amount === 'number'
      ? amount
      : typeof amount === 'string'
        ? Number(amount.replace(/[, ]/gu, ''))
        : Number.NaN;
  if (exponent === undefined || !Number.isFinite(value) || value < 0) return null;
  return { amount_minor: Math.round(value * 10 ** exponent), currency };
}

function barcodeOf(node: Json): ExtractedBooking['barcode'] {
  const token = text(node['ticketToken']);
  const match = token === null ? null : /^(qrCode|aztecCode|barcode128|pdf417):(.+)$/iu.exec(token);
  if (match === null) return null;
  const formats = {
    qrcode: 'qr',
    azteccode: 'aztec',
    barcode128: 'code128',
    pdf417: 'pdf417',
  } as const;
  const format = formats[(match[1] ?? '').toLowerCase() as keyof typeof formats];
  return { format, payload: (match[2] ?? '').slice(0, 4000) };
}

function segmentOf(
  flight: unknown,
  tz: string | null,
): ExtractedBooking['segments'][number] | null {
  const carrier = text(at(at(flight, 'airline'), 'iataCode'))?.toUpperCase();
  const number = text(at(flight, 'flightNumber'))?.replace(
    /^([A-Z][A-Z0-9]|[0-9][A-Z])\s*(?=\d)/u,
    '',
  );
  const dep = text(at(at(flight, 'departureAirport'), 'iataCode'))?.toUpperCase();
  const arr = text(at(at(flight, 'arrivalAirport'), 'iataCode'))?.toUpperCase();
  const departs = instantOf(at(flight, 'departureTime'), tz);
  if (
    carrier === undefined ||
    number === undefined ||
    dep === undefined ||
    arr === undefined ||
    departs === null ||
    !/^[A-Z0-9]{2,3}$/u.test(carrier) ||
    !/^[0-9]{1,4}[A-Z]?$/u.test(number)
  ) {
    return null;
  }
  const arrives = instantOf(at(flight, 'arrivalTime'), tz);
  const gate = text(at(flight, 'departureGate'));
  const terminal = text(at(flight, 'departureTerminal'));
  const boarding = instantOf(at(flight, 'boardingTime'), tz);
  return {
    carrier,
    flight_no: number,
    dep_airport: dep,
    arr_airport: arr,
    sched_dep_at: departs,
    ...(arrives === null ? {} : { sched_arr_at: arrives }),
    ...(gate === null ? {} : { gate: gate.slice(0, 8) }),
    ...(terminal === null ? {} : { terminal: terminal.slice(0, 8) }),
    ...(boarding === null ? {} : { boarding_at: boarding }),
  };
}

function reservationOf(node: Json, options: MarkupOptions): ExtractedBooking | null {
  const kind = KIND_OF_TYPE[typeOf(node)];
  if (kind === undefined) return null;
  const tz = options.defaultTz;
  const target = node['reservationFor'];
  const name = text(at(target, 'name'));
  const booking = emptyExtraction(kind, name ?? kind, 'jsonld');
  const ref = text(node['reservationNumber'] ?? node['confirmationNumber']);
  const provider = text(node['provider'] ?? node['broker']);
  const result: ExtractedBooking = {
    ...booking,
    supplier: kind === 'flight' && options.supplier === 'other' ? 'airline' : options.supplier,
    supplier_name: provider?.slice(0, 120) ?? null,
    supplier_ref: ref?.slice(0, 64) ?? null,
    price: priceOf(node, options),
    travellers: [text(at(node, 'underName'))].filter((n): n is string => n !== null),
    barcode: barcodeOf(node),
  };
  const detail = (key: 'seat' | 'room', value: unknown) =>
    text(value) === null ? {} : { [key]: String(text(value)).slice(0, key === 'seat' ? 8 : 120) };
  switch (kind) {
    case 'flight': {
      const segment = segmentOf(target, tz);
      if (segment === null) return null;
      const airline = text(at(at(target, 'airline'), 'name'));
      return {
        ...result,
        title: `${segment.carrier} ${segment.flight_no} · ${segment.dep_airport} → ${segment.arr_airport}`,
        supplier_name: result.supplier_name ?? airline,
        starts_at: segment.sched_dep_at,
        ends_at: segment.sched_arr_at ?? null,
        segments: [segment],
        details: detail('seat', node['airplaneSeat']),
      };
    }
    case 'stay':
      return {
        ...result,
        starts_at: instantOf(node['checkinTime'] ?? node['checkinDate'], tz),
        ends_at: instantOf(node['checkoutTime'] ?? node['checkoutDate'], tz),
        location: addressOf(at(target, 'address')),
        details: detail('room', node['lodgingUnitDescription']),
      };
    case 'car':
      return {
        ...result,
        title: name ?? text(at(target, 'brand')) ?? 'Car hire',
        starts_at: instantOf(node['pickupTime'], tz),
        ends_at: instantOf(node['dropoffTime'], tz),
        location: addressOf(at(node['pickupLocation'], 'address')) ?? text(node['pickupLocation']),
      };
    case 'transfer':
      return {
        ...result,
        title: name ?? 'Transfer',
        starts_at: instantOf(node['pickupTime'] ?? at(target, 'departureTime'), tz),
        location: text(node['pickupLocation']) ?? text(at(target, 'departureBusStop')),
      };
    case 'activity':
    case 'boat':
    case 'rail':
    case 'other': {
      const departs = at(target, 'departureTime') ?? at(target, 'startDate') ?? node['startTime'];
      const arrives = at(target, 'arrivalTime') ?? at(target, 'endDate');
      const from =
        text(at(target, 'departureStation')) ??
        text(at(target, 'departureBoatTerminal')) ??
        addressOf(at(at(target, 'location'), 'address')) ??
        text(at(target, 'location')) ??
        addressOf(at(target, 'address'));
      return {
        ...result,
        starts_at: instantOf(departs, tz),
        ends_at: instantOf(arrives, tz),
        location: from,
      };
    }
  }
}

/** Merges legs of one flight reservation (same reservation number) into one booking. */
function mergeFlights(bookings: readonly ExtractedBooking[]): ExtractedBooking[] {
  const merged: ExtractedBooking[] = [];
  for (const booking of bookings) {
    const same = merged.find(
      (other) =>
        booking.kind === 'flight' &&
        other.kind === 'flight' &&
        booking.supplier_ref !== null &&
        other.supplier_ref === booking.supplier_ref,
    );
    if (same === undefined) {
      merged.push(booking);
      continue;
    }
    const segments = [...same.segments, ...booking.segments]
      .sort((a, b) => Date.parse(a.sched_dep_at) - Date.parse(b.sched_dep_at))
      .slice(0, 8);
    const first = segments[0];
    const last = segments.at(-1);
    merged[merged.indexOf(same)] = {
      ...same,
      segments,
      title:
        first === undefined || last === undefined
          ? same.title
          : `${first.carrier} ${first.flight_no} · ${first.dep_airport} → ${last.arr_airport}`,
      starts_at: first?.sched_dep_at ?? same.starts_at,
      ends_at: last?.sched_arr_at ?? same.ends_at,
      travellers: [...new Set([...same.travellers, ...booking.travellers])],
    };
  }
  return merged;
}

/** Every booking the JSON-LD blocks describe (nested `@graph`s and lists already flattened). */
export function bookingsFromJsonLd(
  blocks: readonly unknown[],
  options: MarkupOptions,
): ExtractedBooking[] {
  const bookings = blocks
    .filter(isObject)
    .map((node) => reservationOf(node, options))
    .filter((booking): booking is ExtractedBooking => booking !== null);
  return mergeFlights(bookings);
}

/** The same from microdata properties (`reservationFor.name`, `airline.iataCode`, …). */
export function bookingsFromMicrodata(
  reservations: readonly MicrodataReservation[],
  options: MarkupOptions,
): ExtractedBooking[] {
  const nodes = reservations.map((reservation) => {
    const node: Json = { '@type': reservation.type };
    for (const [key, value] of Object.entries(reservation.props)) {
      const path = key.split('.');
      let cursor = node;
      for (const part of path.slice(0, -1)) {
        const next = isObject(cursor[part]) ? cursor[part] : {};
        cursor[part] = next;
        cursor = next;
      }
      cursor[path.at(-1) ?? key] = value;
    }
    return node;
  });
  return bookingsFromJsonLd(nodes, options).map((booking) => ({
    ...booking,
    extracted_by: 'microdata' as const,
  }));
}
