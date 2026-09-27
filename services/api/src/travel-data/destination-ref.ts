/**
 * Resolves the destination a travel-data request names: its id, its slug, or one of its fare
 * airports (`DPS`). Unknown references are `NOT_FOUND`; a destination with no travel-data reference
 * points (a guest-guide destination) resolves with `travel: undefined` so callers can answer with
 * their missing-data state instead of an error.
 */
import { DomainError, TRAVEL_DESTINATIONS, type TravelDestination } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

export interface ResolvedDestination {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly currency: string | null;
  readonly tz: string | null;
  readonly bestMonths: readonly number[];
  readonly travel: TravelDestination | undefined;
}

function slugForAirport(code: string): string | undefined {
  return Object.entries(TRAVEL_DESTINATIONS).find(([, destination]) =>
    destination.airports.includes(code),
  )?.[0];
}

export async function resolveDestination(
  tx: pg.PoolClient,
  ref: string,
): Promise<ResolvedDestination> {
  const isId = z.uuid().safeParse(ref).success;
  const slug = isId ? undefined : (slugForAirport(ref.toUpperCase()) ?? ref.toLowerCase());
  const { rows } = await tx.query<{
    id: string;
    slug: string;
    name: string;
    currency: string | null;
    tz: string | null;
    best_months: number[] | null;
  }>(
    `SELECT id, slug, name, currency, tz, best_months FROM destinations
      WHERE ${isId ? 'id = $1' : 'slug = $1'}`,
    [isId ? ref : slug],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND');
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    currency: row.currency,
    tz: row.tz,
    bestMonths: row.best_months ?? [],
    travel: TRAVEL_DESTINATIONS[row.slug],
  };
}
