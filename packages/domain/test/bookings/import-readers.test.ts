import { describe, expect, it } from 'vitest';

import { dedupeKey } from '../../src/bookings/dedupe';
import { bookingsFromJsonLd } from '../../src/bookings/jsonld';
import { extractJsonLd, htmlToText } from '../../src/bookings/sanitize';

const options = {
  defaultTz: 'Asia/Makassar',
  exponentOf: (currency: string) => ({ IDR: 2, USD: 2, JPY: 0 })[currency],
  supplier: 'agoda' as const,
};

describe('sanitising an email', () => {
  it('keeps the words and drops scripts, styles, pixels, hidden blocks and comments', () => {
    const html = `<head><style>p{}</style></head><body><!-- track -->
      <div style="display:none">preheader secret</div><p>Booking&nbsp;ID: <b>123</b></p>
      <img src="https://t.example/p.gif"><script>alert(1)</script><p>Check-in &amp; relax</p></body>`;
    expect(htmlToText(html)).toBe('Booking ID: 123\n\nCheck-in & relax');
  });

  it('reads JSON-LD blocks, graphs included, and skips broken ones', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"A"},{"@type":"B"}]}</script>
      <script type="application/ld+json">{broken</script>`;
    expect(extractJsonLd(html)).toEqual([{ '@type': 'A' }, { '@type': 'B' }]);
  });
});

describe('schema.org reservations', () => {
  it('reads a stay with a price, reading offset-less times in the trip zone', () => {
    const [stay] = bookingsFromJsonLd(
      [
        {
          '@type': 'LodgingReservation',
          reservationNumber: '1482236907',
          reservationFor: { name: 'Villa Tirta', address: { addressLocality: 'Ubud' } },
          checkinTime: '2026-10-12T14:00',
          checkoutDate: '2026-10-19',
          totalPrice: '12600000',
          priceCurrency: 'IDR',
        },
      ],
      options,
    );
    expect(stay).toMatchObject({
      kind: 'stay',
      title: 'Villa Tirta',
      supplier: 'agoda',
      supplier_ref: '1482236907',
      starts_at: '2026-10-12T06:00:00.000Z',
      ends_at: '2026-10-18T16:00:00.000Z',
      location: 'Ubud',
      price: { amount_minor: 1_260_000_000, currency: 'IDR' },
    });
  });

  it('merges the legs of one flight reservation and keeps the full flight number', () => {
    const leg = (flightNumber: string, from: string, to: string, at: string) => ({
      '@type': 'FlightReservation',
      reservationNumber: 'RXJ34P',
      reservationFor: {
        flightNumber,
        airline: { iataCode: 'SQ' },
        departureAirport: { iataCode: from },
        arrivalAirport: { iataCode: to },
        departureTime: at,
      },
    });
    const flights = bookingsFromJsonLd(
      [
        leg('SQ 211', 'SYD', 'SIN', '2026-10-11T15:00:00+11:00'),
        leg('938', 'SIN', 'DPS', '2026-10-12T09:40:00+08:00'),
      ],
      options,
    );
    expect(flights).toHaveLength(1);
    expect(flights[0]?.segments.map((s) => s.flight_no)).toEqual(['211', '938']);
    expect(flights[0]?.title).toBe('SQ 211 · SYD → DPS');
  });
});

describe('dedupe keys', () => {
  it('names the scope, the seller and the code, however the code is spaced', () => {
    const [a] = bookingsFromJsonLd(
      [
        {
          '@type': 'EventReservation',
          reservationNumber: 'KLK-88 213',
          reservationFor: { name: 'Tour' },
        },
      ],
      options,
    );
    const [b] = bookingsFromJsonLd(
      [
        {
          '@type': 'EventReservation',
          reservationNumber: 'klk88213',
          reservationFor: { name: 'Tour!' },
        },
      ],
      options,
    );
    const crew = { kind: 'crew' as const, id: 'c1' };
    expect(a && dedupeKey(crew, a)).toBe(b && dedupeKey(crew, b));
    expect(a && dedupeKey({ kind: 'user', id: 'u1' }, a)).not.toBe(a && dedupeKey(crew, a));
  });
});
