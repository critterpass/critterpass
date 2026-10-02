/**
 * The flight status adapters against response shapes from the AeroAPI v4 and AeroDataBox
 * references, through the real audited supplier client with only `fetch` replayed.
 */
import { describe, expect, it } from 'vitest';

import { createSupplierHttp, SupplierHttpError, type SupplierCallRecord } from '../src';
import { createAeroApiClient, createAeroDataBoxClient, splitIdent } from '../src/flight-status';

const AERO_FLIGHT = {
  fa_flight_id: 'SIA938-1760000000-schedule-0001',
  ident: 'SIA938',
  ident_iata: 'SQ938',
  operator_iata: 'SQ',
  flight_number: '938',
  status: 'Scheduled / Delayed',
  cancelled: false,
  diverted: false,
  departure_delay: 2700,
  scheduled_out: '2026-10-12T01:40:00Z',
  estimated_out: '2026-10-12T02:25:00Z',
  actual_out: null,
  scheduled_in: '2026-10-12T04:10:00Z',
  estimated_in: '2026-10-12T04:50:00Z',
  actual_in: null,
  gate_origin: 'B4',
  terminal_origin: '3',
  origin: { code_iata: 'SIN' },
  destination: { code_iata: 'DPS' },
};

function stub(status: number, body: unknown) {
  const audit: SupplierCallRecord[] = [];
  const urls: string[] = [];
  const http = createSupplierHttp({
    audit: (record) => {
      audit.push(record);
      return Promise.resolve();
    },
    fetch: (url) => {
      urls.push(url.toString());
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    },
    sleep: () => Promise.resolve(),
  });
  return { http, audit, urls };
}

describe('AeroAPI', () => {
  it('reads a delayed flight by id and audits the call without its key', async () => {
    const { http, audit, urls } = stub(200, { flights: [AERO_FLIGHT] });
    const client = createAeroApiClient(http, { apiKey: 'secret-key' });
    expect(await client.flightById(AERO_FLIGHT.fa_flight_id)).toMatchObject({
      provider: 'flightaware',
      carrier: 'SQ',
      flightNo: '938',
      status: 'delayed',
      delayMin: 45,
      gate: 'B4',
      estDepAt: '2026-10-12T02:25:00Z',
    });
    expect(urls[0]).not.toContain('secret-key');
    expect(audit).toEqual([
      expect.objectContaining({ supplier: 'flightaware', endpoint: 'flight_by_id', outcome: 'ok' }),
    ]);
  });

  it('maps a server error to a retryable supplier error', async () => {
    const { http, audit } = stub(503, {});
    await expect(createAeroApiClient(http, { apiKey: 'k' }).flightById('x')).rejects.toMatchObject({
      retryable: true,
    });
    expect(audit.length).toBe(3);
    await expect(
      createAeroApiClient(stub(401, {}).http, { apiKey: 'k' }).flightById('x'),
    ).rejects.toBeInstanceOf(SupplierHttpError);
  });
});

describe('AeroDataBox', () => {
  it('reads a flight by number and date', async () => {
    const { http, urls } = stub(200, [
      {
        number: 'SQ 938',
        status: 'Departed',
        airline: { iata: 'SQ' },
        departure: {
          airport: { iata: 'SIN' },
          scheduledTime: { utc: '2026-10-12 01:40Z', local: '2026-10-12 09:40+08:00' },
          revisedTime: { utc: '2026-10-12 01:55Z' },
          runwayTime: { utc: '2026-10-12 02:05Z' },
          terminal: '3',
          gate: 'B6',
        },
        arrival: { airport: { iata: 'DPS' }, scheduledTime: { utc: '2026-10-12 04:10Z' } },
      },
    ]);
    const [flight] = await createAeroDataBoxClient(http, { apiKey: 'k' }).flightsOn(
      'SQ',
      '938',
      '2026-10-12',
    );
    expect(urls[0]).toContain('/flights/number/SQ938/2026-10-12');
    expect(flight).toMatchObject({
      status: 'departed',
      delayMin: 15,
      gate: 'B6',
      actDepAt: '2026-10-12T02:05:00.000Z',
    });
  });

  it('reads a number over a range of departure dates, with each airport zone', async () => {
    const { http, urls } = stub(200, [
      {
        number: '9G 956',
        status: 'Expected',
        airline: { iata: '9G', name: '9G Rail' },
        departure: {
          airport: { iata: 'SGN', timeZone: 'Asia/Ho_Chi_Minh' },
          scheduledTime: { utc: '2026-10-03 00:05Z', local: '2026-10-03 07:05+07:00' },
        },
        arrival: {
          airport: { iata: 'DAD', timeZone: 'Asia/Ho_Chi_Minh' },
          scheduledTime: { utc: '2026-10-03 01:30Z', local: '2026-10-03 08:30+07:00' },
        },
      },
    ]);
    const [flight] = await createAeroDataBoxClient(http, { apiKey: 'k' }).flightsDeparting(
      '9G',
      '956',
      '2026-10-02',
      '2026-10-04',
    );
    expect(urls[0]).toContain(
      '/flights/number/9G956/2026-10-02/2026-10-04?dateLocalRole=Departure',
    );
    expect(flight).toMatchObject({
      carrier: '9G',
      flightNo: '956',
      depAirport: 'SGN',
      arrAirport: 'DAD',
      schedDepAt: '2026-10-03T00:05:00.000Z',
      schedArrAt: '2026-10-03T01:30:00.000Z',
      depTz: 'Asia/Ho_Chi_Minh',
      arrTz: 'Asia/Ho_Chi_Minh',
    });
  });

  it('reads no flights from an empty answer, and still refuses a broken one', async () => {
    const empty = createSupplierHttp({
      audit: () => Promise.resolve(),
      fetch: () => Promise.resolve(new Response(null, { status: 204 })),
      sleep: () => Promise.resolve(),
    });
    const client = createAeroDataBoxClient(empty, { apiKey: 'k' });
    expect(await client.flightsDeparting('9G', '999', '2026-10-02', '2026-10-04')).toEqual([]);
    const broken = stub(200, { flights: 'nope' });
    await expect(
      createAeroDataBoxClient(broken.http, { apiKey: 'k' }).flightsOn('9G', '956', '2026-10-02'),
    ).rejects.toBeInstanceOf(SupplierHttpError);
  });

  it('splits an ident into carrier and number', () => {
    expect(splitIdent('SQ 0938')).toEqual({ carrier: 'SQ', number: '938' });
    expect(splitIdent('3K521')).toEqual({ carrier: '3K', number: '521' });
    expect(splitIdent('nonsense')).toBeNull();
  });
});
