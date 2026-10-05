/** Reason chips carried in a route param ("slower,less_travel"), unknown words dropped. */
import { REDRAFT_REASON_KEYS, type RedraftReasonKey } from '@cp/domain';

export function parseReasons(value: string | undefined): RedraftReasonKey[] {
  if (value === undefined || value === '') return [];
  const known = new Set<string>(REDRAFT_REASON_KEYS);
  return value.split(',').filter((word): word is RedraftReasonKey => known.has(word));
}
