/**
 * The flag guard every partner API call passes through. A partner adapter (Viator booking, Agoda
 * Demand, Klook, Trip.com, GYG) runs only while its `ops.partner_adapters` row is enabled; the ops
 * console's `set_partner_adapter` flips the row and the public `supplier.<partner>.*` copy keys in
 * one transaction, so an adapter never runs while the app still shows link copy, or the reverse.
 * Off, the caller answers `SUPPLIER_UNAVAILABLE` and the client shows the partner link.
 */
import type { PartnerKey } from '@cp/domain';

import { supplierUnavailable } from './errors';

/** Runs one parameterised read in the caller's transaction or on its pool. */
export type FlagQuery = (
  sql: string,
  params: readonly unknown[],
) => Promise<{ readonly rows: readonly Record<string, unknown>[] }>;

export async function isPartnerEnabled(query: FlagQuery, partner: PartnerKey): Promise<boolean> {
  const { rows } = await query('SELECT enabled FROM ops.partner_adapters WHERE partner = $1', [
    partner,
  ]);
  return rows[0]?.['enabled'] === true;
}

/** Throws `SUPPLIER_UNAVAILABLE` unless the partner's adapter is switched on. */
export async function requirePartnerEnabled(query: FlagQuery, partner: PartnerKey): Promise<void> {
  if (!(await isPartnerEnabled(query, partner))) {
    throw supplierUnavailable(partner, 'flag_off');
  }
}
