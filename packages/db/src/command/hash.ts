/**
 * The `cmd_log.payload_hash` an op is claimed under (docs/api-contracts.md §2.3 step 3): sha256 of
 * a canonical JSON form, so the same logical payload hashes identically however the client ordered
 * its object keys, and a retried op with a changed payload is caught as `IDEMPOTENCY_MISMATCH`.
 */
import { createHash } from 'node:crypto';

function canonicalise(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toJSON();
  if (Array.isArray(value))
    return value.map((item) => (item === undefined ? null : canonicalise(item)));
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => [key, canonicalise(item)] as const);
  return Object.fromEntries(entries);
}

/** JSON with object keys sorted at every depth and `undefined` members dropped (JSON semantics). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value)) ?? 'null';
}

/**
 * Hashes the command name and version together with the payload: the same op_id reused for a
 * different command is as much a client bug as a changed payload, and must not replay the first
 * command's stored result.
 */
export function commandPayloadHash(cmd: string, v: number, payload: unknown): string {
  return createHash('sha256').update(canonicalJson({ cmd, v, payload })).digest('hex');
}
