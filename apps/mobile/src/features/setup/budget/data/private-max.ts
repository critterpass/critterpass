/**
 * The member's own private max, on their own device only. The value leaves the phone once, in
 * `submit_budget_max`; the server keeps it write-only and answers the owner alone through
 * `GET /v1/me/private/budget_max`, which this caches in the encrypted local-only `local_private`
 * table (never synced, wiped on sign-out). The screen shows "Set ✓ · change" and reads the value
 * only to prefill the owner's own change form. Also the owner's saved default and their own fit
 * against the organiser's locked target.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, api paths and wire values, never copy. */
import type { OwnFitState } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useLiveRows } from '../../data/rows';
import { useSetupServices, type SetupServices } from '../../data/services';

export const OWN_MAX_KIND = 'budget_max';

export interface OwnAmount {
  readonly amountMinor: number;
  readonly currency: string;
}

export function ownMaxId(tripId: string): string {
  return `${OWN_MAX_KIND}:${tripId}`;
}

export async function saveOwnMax(
  db: AbstractPowerSyncDatabase,
  tripId: string,
  value: OwnAmount,
  at: Date,
): Promise<void> {
  const id = ownMaxId(tripId);
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM local_private WHERE id = ?', [id]);
    await tx.execute('INSERT INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)', [
      id,
      OWN_MAX_KIND,
      JSON.stringify({ amount_minor: value.amountMinor, currency: value.currency }),
      at.toISOString(),
    ]);
  });
}

function parseOwn(data: string | null | undefined): OwnAmount | null {
  if (data === null || data === undefined) return null;
  try {
    const parsed = JSON.parse(data) as { amount_minor?: unknown; currency?: unknown };
    return typeof parsed.amount_minor === 'number' && typeof parsed.currency === 'string'
      ? { amountMinor: parsed.amount_minor, currency: parsed.currency }
      : null;
  } catch {
    return null;
  }
}

function amountOf(body: unknown): OwnAmount | null {
  const wire = body as { amount_minor?: unknown; currency?: unknown } | null;
  return typeof wire?.amount_minor === 'number' && typeof wire.currency === 'string'
    ? { amountMinor: wire.amount_minor, currency: wire.currency }
    : null;
}

/** Pulls the owner's own value from the api into `local_private` (no-op when unset or offline). */
export async function refreshOwnMax(
  db: AbstractPowerSyncDatabase,
  services: SetupServices,
  tripId: string,
): Promise<void> {
  const read = await services.getJson(
    `/v1/me/private/budget_max?trip_id=${encodeURIComponent(tripId)}`,
  );
  const own = read.kind === 'ok' ? amountOf(read.body) : null;
  if (own !== null) await saveOwnMax(db, tripId, own, new Date(services.now()));
}

const OWN_SQL = 'SELECT data FROM local_private WHERE id = ?';
const QUEUED_SQL = `SELECT count(*) AS n FROM commands
  WHERE cmd = 'submit_budget_max' AND json_extract(envelope, '$.payload.trip_id') = ?`;

export interface OwnMaxState {
  readonly loaded: boolean;
  /** This device knows the member has a max in (sent, or waiting to send). */
  readonly set: boolean;
  readonly queued: boolean;
  /** The owner's own value, for their own change form only. */
  readonly own: OwnAmount | null;
  readonly fit: OwnFitState | null;
  readonly usual: OwnAmount | null;
}

export function useOwnMax(tripId: string): OwnMaxState {
  const { db } = useLocalFirst();
  const services = useSetupServices();
  const own = useLiveRows<{ data: string }>(OWN_SQL, [ownMaxId(tripId)], ['local_private']);
  const queued = useLiveRows<{ n: number }>(QUEUED_SQL, [tripId], ['commands']);
  const [fit, setFit] = useState<OwnFitState | null>(null);
  const [usual, setUsual] = useState<OwnAmount | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      await refreshOwnMax(db, services, tripId);
      const fitRead = await services.getJson(`/v1/setup/${encodeURIComponent(tripId)}/own-fit`);
      const state = (fitRead.kind === 'ok' ? (fitRead.body as { state?: unknown }) : null)?.state;
      const usualRead = await services.getJson('/v1/me/private/budget_default');
      if (!live) return;
      if (typeof state === 'string') setFit(state as OwnFitState);
      if (usualRead.kind === 'ok') setUsual(amountOf(usualRead.body));
    };
    load().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [db, services, tripId]);
  const value = parseOwn(own.rows[0]?.data);
  const pending = (queued.rows[0]?.n ?? 0) > 0;
  return {
    loaded: own.loaded && queued.loaded,
    set: value !== null || pending,
    queued: pending,
    own: value,
    fit,
    usual,
  };
}
