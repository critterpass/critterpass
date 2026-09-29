/**
 * Stable ids the drafting job derives rather than draws: the same seed (job, day, attempt, slot)
 * always gives the same UUID, so a retried step writes the rows it wrote before instead of new
 * ones. Version 8 (custom) UUIDs from SHA-256.
 */
import { createHash } from 'node:crypto';

export function derivedUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
