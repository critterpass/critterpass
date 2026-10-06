/** The trip as an organiser removing it sees it: its status (row-locked) and their role. */
import { DomainError } from '@cp/domain';
import type pg from 'pg';

export interface RemovalRow {
  readonly status: string;
  readonly organiser: boolean;
  readonly crew_id: string;
}

export async function loadTripForRemoval(tx: pg.PoolClient, tripId: string): Promise<RemovalRow> {
  const { rows } = await tx.query<RemovalRow>(
    'SELECT status, crew_id, app.is_trip_organiser(id) AS organiser FROM trips WHERE id = $1',
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return row;
}

export async function requireOrganiser(tx: pg.PoolClient, tripId: string): Promise<void> {
  const trip = await loadTripForRemoval(tx, tripId);
  if (!trip.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
}

/** Holds the trip's row for the rest of the transaction and answers its status now. */
export async function lockTripStatus(tx: pg.PoolClient, tripId: string): Promise<string> {
  const { rows } = await tx.query<{ status: string }>(
    'SELECT status FROM trips WHERE id = $1 FOR UPDATE',
    [tripId],
  );
  const status = rows[0]?.status;
  if (status === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return status;
}
