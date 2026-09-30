/**
 * The member's own travel-insurance policies, on their own device only. The server keeps them
 * sealed and answers the owner alone through `GET /v1/me/private/insurance`; this caches that
 * answer in the encrypted local-only `local_private` table (never synced, wiped on sign-out), so
 * the policy card and the assistance number open with no signal.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, api paths and wire values, never copy. */
import type { PrivateInsuranceWire } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect, useMemo } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useLiveRows } from '../data/live-rows';
import { parseJson, PRIVATE_BY_KIND_SQL, PRIVATE_TABLES } from '../data/queries';
import { useBookingsServices, type BookingsServices } from '../data/services';

export const INSURANCE_KIND = 'insurance_policy';

export type InsurancePolicy = PrivateInsuranceWire;

function policiesOf(body: unknown): InsurancePolicy[] | null {
  const policies = (body as { policies?: unknown } | null)?.policies;
  return Array.isArray(policies) ? (policies as InsurancePolicy[]) : null;
}

/** Replaces the phone's copy with the server's (a no-op offline: the last copy stays). */
export async function refreshInsurance(
  db: AbstractPowerSyncDatabase,
  services: BookingsServices,
): Promise<void> {
  const read = await services.getJson('/v1/me/private/insurance');
  const policies = read.kind === 'ok' ? policiesOf(read.value) : null;
  if (policies === null) return;
  const at = new Date(services.now()).toISOString();
  await db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM local_private WHERE kind = ?', [INSURANCE_KIND]);
    for (const policy of policies) {
      await tx.execute(
        'INSERT INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)',
        [`${INSURANCE_KIND}:${policy.policy_id}`, INSURANCE_KIND, JSON.stringify(policy), at],
      );
    }
  });
}

/** Drops one policy from the phone at once (its delete may still be queued). */
export async function forgetInsurance(
  db: AbstractPowerSyncDatabase,
  policyId: string,
): Promise<void> {
  await db.execute('DELETE FROM local_private WHERE id = ?', [`${INSURANCE_KIND}:${policyId}`]);
}

/** The policy for `tripId`, else one without a trip, else the newest. */
export function pickPolicy(
  policies: readonly InsurancePolicy[],
  tripId: string | null,
): InsurancePolicy | null {
  return (
    policies.find((policy) => policy.trip_id === tripId) ??
    policies.find((policy) => policy.trip_id === null) ??
    policies[0] ??
    null
  );
}

export function useInsurancePolicies(): { loaded: boolean; policies: InsurancePolicy[] } {
  const { db } = useLocalFirst();
  const services = useBookingsServices();
  const rows = useLiveRows<{ id: string; data: string }>(
    PRIVATE_BY_KIND_SQL,
    [INSURANCE_KIND],
    PRIVATE_TABLES,
  );
  useEffect(() => {
    refreshInsurance(db, services).catch(() => undefined);
  }, [db, services]);
  return useMemo(
    () => ({
      loaded: rows.loaded,
      policies: rows.rows
        .map((row) => parseJson<InsurancePolicy | null>(row.data, null))
        .filter((policy): policy is InsurancePolicy => policy !== null)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    }),
    [rows.loaded, rows.rows],
  );
}

/** "Policy No. CHB-2231-889" → "CHB-2231-889": the first policy-number line a scan read. */
export function policyNumberFrom(lines: readonly string[]): string | null {
  const label =
    /\b(?:policy|certificate)\s*(?:no\.?|number|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9-/]{4,})/iu;
  for (const line of lines) {
    const value = label.exec(line)?.[1];
    if (value !== undefined && /\d/u.test(value)) return value.toUpperCase();
  }
  return null;
}

/** "+65 6812 3456": the first assistance or emergency phone number a scan read. */
export function assistancePhoneFrom(lines: readonly string[]): string | null {
  for (const line of lines) {
    if (!/(assist|emergenc|24\s*h|hotline)/iu.test(line)) continue;
    const match = /(\+?\d[\d\s().-]{6,}\d)/u.exec(line);
    if (match?.[1] !== undefined) return match[1].replace(/\s+/gu, ' ').trim();
  }
  return null;
}
