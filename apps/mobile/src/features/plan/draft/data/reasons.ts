/** Reason chips carried in a route param ("slower,less_train"), unknown words dropped. */
import { REDRAFT_REASONS, type RedraftReason } from '@cp/domain';

export function parseReasons(value: string | undefined): RedraftReason[] {
  if (value === undefined || value === '') return [];
  const known = new Set<string>(REDRAFT_REASONS);
  return value.split(',').filter((word): word is RedraftReason => known.has(word));
}
