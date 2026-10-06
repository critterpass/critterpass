/**
 * Finding a driver on the api (6a–6f): the driver commands, and the reads that are not synced.
 *
 * - `GET /v1/drivers?trip_id=`: the trip's SHARED WITH TOKEK list (shared messages carry a third
 *   party's number, so they are never synced) and the shortlist with each driver's number opened
 *   for the crew.
 * - `POST /v1/drivers/intake/{id}/read`: reads a shared message into a driver card (route
 *   `provider.extract`); every field keeps the span of the words it came from.
 * - `GET /v1/drivers/private-tours?trip_id&days`: private cars with a driver from Klook and
 *   Viator, verbatim, fetched per view and never stored. Without a partner's API the answer is a
 *   link row to the partner's search.
 *
 * We never read or post to groups, and the server sends no WhatsApp message: the app opens each one
 * in the traveller's own WhatsApp.
 */
import { extractProvider, type Gateway } from '@cp/ai';
import { currencyExponent, isKnownCurrency } from '@cp/cost-engine';
import { withSystem, withUser } from '@cp/db';
import {
  callingCodeFor,
  DomainError,
  generateUuidV7,
  parsedIntakeSchema,
  privateToursQuerySchema,
  toCountryCode,
  type IntakeItem,
  type IntakeReadResult,
} from '@cp/domain';
import {
  isPartnerEnabled,
  privateTransportCards,
  privateTransportTarget,
  type PrivateTransportCard,
} from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { registerDriverCommands } from '../commands/drivers';
import { openPhone, requireMember, type DriverDeps } from '../commands/drivers/shared';
import type { CommandRegistry } from '../commands/_framework/registry';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import type { ApiEnv } from '../env';
import { planningGateway } from '../planning/search/gateway';
import { createAuditedSupplierHttp } from '../suppliers/http';
import { viatorPortFromEnv, type ActivityBookingPort } from '../suppliers/order-port';

export interface DriverRouteDeps extends DriverDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  /** The model gateway for reading shared messages; none = every read answers `failed`. */
  readonly gateway: Pick<Gateway, 'callModel'> | undefined;
  /** Viator search, where a key exists. */
  readonly viator: Pick<ActivityBookingPort, 'search'> | undefined;
}

interface TripContext {
  readonly currency: string;
  readonly country: string | null;
  readonly area: string;
}

async function tripContext(tx: pg.PoolClient, tripId: string): Promise<TripContext> {
  const { rows } = await tx.query<{ currency: string; country: string | null; area: string }>(
    `SELECT coalesce(t.local_currency, d.currency, 'USD') AS currency, d.country,
            coalesce(d.name, '') AS area
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return row;
}

const minorPerMajor = (code: string): number | null =>
  isKnownCurrency(code) ? 10 ** currencyExponent(code) : null;

interface IntakeRow {
  readonly id: string;
  readonly kind: IntakeItem['kind'];
  readonly status: IntakeItem['status'];
  readonly shared_by: string;
  readonly shared_by_name: string | null;
  readonly raw_text: string | null;
  readonly parsed: unknown;
  readonly provider_id: string | null;
  readonly created_at: Date;
}

interface DriverRow {
  readonly id: string;
  readonly name: string;
  readonly contact_enc: string | null;
  readonly vehicle: unknown;
  readonly added_by: string | null;
  readonly terms: Record<string, unknown> | null;
}

const tripQuery = z.object({ trip_id: z.uuid() }).strict();

export function registerDriverRoutes(app: OpenAPIHono<AppEnv>, deps: DriverRouteDeps): void {
  app.get('/v1/drivers', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = tripQuery.safeParse(c.req.query());
    if (!query.success) throw new DomainError('VALIDATION', { reason: 'query' });
    const tripId = query.data.trip_id;
    await withUser(deps.pool, session.uid, generateUuidV7(), (tx) => requireMember(tx, tripId));
    const body = await withSystem(deps.pool, async (tx) => {
      const intake = await tx.query<IntakeRow>(
        `SELECT i.id, i.kind, i.status, i.shared_by, u.name AS shared_by_name, i.raw_text, i.parsed,
                i.provider_id, i.created_at
           FROM provider_intake i LEFT JOIN users u ON u.id = i.shared_by
          WHERE i.trip_id = $1 ORDER BY i.created_at DESC LIMIT 50`,
        [tripId],
      );
      const drivers = await tx.query<DriverRow>(
        `SELECT p.id, p.name, p.contact_enc, p.vehicle, p.added_by, to_jsonb(t) AS terms
           FROM providers p JOIN provider_terms t ON t.provider_id = p.id
          WHERE p.trip_id = $1 AND p.kind = 'driver' AND p.deleted_at IS NULL
          ORDER BY p.created_at`,
        [tripId],
      );
      return {
        intake: intake.rows.map(
          (row): IntakeItem => ({
            id: row.id,
            kind: row.kind,
            status: row.status,
            shared_by: row.shared_by,
            shared_by_name: row.shared_by_name,
            text: row.raw_text,
            parsed: parsedIntakeSchema.safeParse(row.parsed).data ?? null,
            provider_id: row.provider_id,
            created_at: row.created_at.toISOString(),
          }),
        ),
        drivers: drivers.rows.map((row) => ({
          id: row.id,
          name: row.name,
          phone: openPhone(deps, row.contact_enc),
          vehicle: row.vehicle,
          added_by: row.added_by,
          terms: row.terms,
        })),
      };
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });

  app.post('/v1/drivers/intake/:id/read', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const id = z.uuid().safeParse(c.req.param('id'));
    if (!id.success) throw new DomainError('NOT_FOUND', { reason: 'intake' });
    const intake = await withSystem(deps.pool, async (tx) => {
      const { rows } = await tx.query<{
        trip_id: string;
        kind: IntakeItem['kind'];
        raw_text: string | null;
      }>('SELECT trip_id, kind, raw_text FROM provider_intake WHERE id = $1', [id.data]);
      return rows[0];
    });
    if (intake === undefined) throw new DomainError('NOT_FOUND', { reason: 'intake' });
    const trip = await withUser(deps.pool, session.uid, generateUuidV7(), async (tx) => {
      await requireMember(tx, intake.trip_id);
      return tripContext(tx, intake.trip_id);
    });
    const parsed =
      deps.gateway === undefined || intake.raw_text === null
        ? null
        : await extractProvider(
            deps.gateway,
            {
              text: intake.raw_text,
              kind: intake.kind,
              currencyHint: trip.currency,
              minorPerMajor,
              callingCode: callingCodeFor(toCountryCode(trip.country)),
            },
            { userId: session.uid },
          );
    const status = parsed === null ? 'failed' : 'parsed';
    await withSystem(deps.pool, (tx) =>
      tx.query(
        `UPDATE provider_intake SET status = $2, parsed = $3, parsed_at = now()
          WHERE id = $1 AND status <> 'used'`,
        [id.data, status, parsed === null ? null : JSON.stringify(parsed)],
      ),
    );
    const result: IntakeReadResult = { intake_id: id.data, status, parsed };
    return c.json(result);
  });

  app.get('/v1/drivers/private-tours', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = privateToursQuerySchema.safeParse(c.req.query());
    if (!query.success) throw new DomainError('VALIDATION', { reason: 'query' });
    const { trip_id: tripId } = query.data;
    const days = query.data.days?.split(',') ?? [];
    const { trip, people, klookOn, viatorOn } = await withUser(
      deps.pool,
      session.uid,
      generateUuidV7(),
      async (tx) => {
        await requireMember(tx, tripId);
        const context = await tripContext(tx, tripId);
        const party = await tx.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM trip_participants WHERE trip_id = $1 AND holds_seat',
          [tripId],
        );
        const flag = (partner: 'klook_activity' | 'viator_booking') =>
          isPartnerEnabled((sql, params) => tx.query(sql, params as unknown[]), partner);
        return {
          trip: context,
          people: party.rows[0]?.n ?? 1,
          klookOn: await flag('klook_activity'),
          viatorOn: await flag('viator_booking'),
        };
      },
    );
    const date = days[0] ?? null;
    const target = privateTransportTarget(trip.area, date, people);
    const destinationRef = c.req.query('destination_ref');
    let cards: PrivateTransportCard[] = [];
    let supplierDown = false;
    if (viatorOn && deps.viator !== undefined && destinationRef !== undefined && date !== null) {
      try {
        cards = privateTransportCards(
          await deps.viator.search({ destinationRef, date, currency: trip.currency }),
        );
      } catch {
        supplierDown = true;
      }
    }
    c.header('Cache-Control', 'no-store');
    return c.json({
      area: trip.area,
      people,
      cards,
      supplier_down: supplierDown,
      links: [
        { partner: 'klook', api: klookOn, target },
        { partner: 'viator', api: viatorOn, target },
      ],
    });
  });
}

/** The driver routes as the api boots them: the planning gateway, the keyring and Viator search. */
export function registerDriverRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  doors: Pick<DriverRouteDeps, 'pool' | 'sessions'> & {
    readonly registry: CommandRegistry;
    readonly logger: { warn(obj: unknown, message: string): void };
  },
  env: ApiEnv,
  keyring: DriverDeps['keyring'],
): void {
  const http = createAuditedSupplierHttp(doors.pool, (error) =>
    doors.logger.warn({ err: error }, 'supplier call audit write failed'),
  );
  registerDriverCommands(doors.registry, { keyring });
  registerDriverRoutes(app, {
    pool: doors.pool,
    sessions: doors.sessions,
    keyring,
    gateway: planningGateway(env, doors.pool),
    viator: viatorPortFromEnv(process.env, http),
  });
}
