/**
 * Job payload redaction for the console's jobs panel: dead letters and queued payloads are shown
 * with ids, numbers, flags and short machine values intact and everything else masked.
 */

export type JobPayloadRedactor = (data: unknown) => unknown;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Short machine values (kinds, keys, dates, routes) are safe to show; anything else is masked. */
const SAFE_TOKEN = /^[A-Za-z0-9_.:+-]{1,64}$/;
const SECRET_KEY = /token|secret|password|key_material|authorization/i;

function redactValue(key: string, value: unknown, depth: number): unknown {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (SECRET_KEY.test(key)) return value.length > 4 ? `…${value.slice(-4)}` : '…';
    return UUID.test(value) || SAFE_TOKEN.test(value) ? value : '[redacted]';
  }
  if (depth >= 4) return '[redacted]';
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => redactValue(key, item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactValue(k, v, depth + 1)]),
    );
  }
  return '[redacted]';
}

/**
 * The default payload redaction: ids, numbers, flags and short machine values stay; free text is
 * masked; anything under a token or secret key shows only its last 4 characters.
 */
export const redactJobPayload: JobPayloadRedactor = (data) => redactValue('', data, 0);
