/**
 * Fixture identity helpers shared by transaction and permission tests. `anonymousActor` needs no
 * backing row (app.uid()/app.device() are session variables); the insert* helpers below build real
 * rows once the owning tables exist, for permission tests that need actual users/crews.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

export interface TestActor {
  readonly uid: string;
  readonly device: string;
}

export function randomId(): string {
  return randomUUID();
}

/** A synthetic actor with no backing row, for RLS/session-variable tests. */
export function anonymousActor(): TestActor {
  return { uid: randomId(), device: randomId() };
}

/** The first row, or a thrown error: fixture setup invariants, never user input. */
export function firstRow<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected at least one row');
  return row;
}

export interface InsertUserOptions {
  readonly id?: string;
  readonly username?: string;
  readonly status?: string;
}

export async function insertUser(
  client: pg.PoolClient | pg.Pool,
  options: InsertUserOptions = {},
): Promise<string> {
  const id = options.id ?? randomId();
  await client.query(
    'INSERT INTO users (id, username, status) VALUES ($1, $2, $3)',
    [id, options.username ?? null, options.status ?? 'registered'],
  );
  return id;
}

export interface InsertCrewOptions {
  readonly name?: string;
  readonly createdBy: string;
}

export async function insertCrew(
  client: pg.PoolClient | pg.Pool,
  options: InsertCrewOptions,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id',
    [options.name ?? 'Test Crew', options.createdBy],
  );
  return firstRow(rows).id;
}

export interface InsertCrewMemberOptions {
  readonly crewId: string;
  readonly userId: string;
  readonly role?: 'organiser' | 'member';
  readonly status?: 'active' | 'left' | 'removed' | 'former';
  readonly keepInChat?: boolean;
}

export async function insertCrewMember(
  client: pg.PoolClient | pg.Pool,
  options: InsertCrewMemberOptions,
): Promise<void> {
  await client.query(
    `INSERT INTO crew_members (crew_id, user_id, role, status, keep_in_chat)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      options.crewId,
      options.userId,
      options.role ?? 'member',
      options.status ?? 'active',
      options.keepInChat ?? false,
    ],
  );
}

export async function setCrewMemberStatus(
  client: pg.PoolClient | pg.Pool,
  options: { readonly crewId: string; readonly userId: string; readonly status: string },
): Promise<void> {
  await client.query('UPDATE crew_members SET status = $1 WHERE crew_id = $2 AND user_id = $3', [
    options.status,
    options.crewId,
    options.userId,
  ]);
}

export async function getCrewMembershipEpoch(
  client: pg.PoolClient | pg.Pool,
  crewId: string,
): Promise<number> {
  const { rows } = await client.query<{ membership_epoch: number }>(
    'SELECT membership_epoch FROM crews WHERE id = $1',
    [crewId],
  );
  return firstRow(rows).membership_epoch;
}

export interface InsertTripOptions {
  readonly crewId: string;
  readonly status?: string;
}

export async function insertTrip(
  client: pg.PoolClient | pg.Pool,
  options: InsertTripOptions,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO trips (crew_id, status) VALUES ($1, $2) RETURNING id',
    [options.crewId, options.status ?? 'voting'],
  );
  return firstRow(rows).id;
}

export interface InsertTripParticipantOptions {
  readonly tripId: string;
  readonly userId: string;
  readonly role?: 'organiser' | 'member';
  readonly rsvp?: string;
}

export async function insertTripParticipant(
  client: pg.PoolClient | pg.Pool,
  options: InsertTripParticipantOptions,
): Promise<void> {
  await client.query(
    'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
    [options.tripId, options.userId, options.role ?? 'member', options.rsvp ?? 'unopened'],
  );
}

export async function setTripStatus(
  client: pg.PoolClient | pg.Pool,
  options: { readonly tripId: string; readonly status: string },
): Promise<void> {
  await client.query('UPDATE trips SET status = $1 WHERE id = $2', [options.status, options.tripId]);
}
