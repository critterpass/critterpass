/**
 * A live local query with bound parameters for the setup screens: runs now and again whenever one
 * of `tables` changes, with `loaded` false until the first delivery. `null` params skip the query
 * (something it depends on is not known yet).
 * The app's shared hook, in the form where a failed read is not an answer.
 */
export {
  useQuietLiveRows as useLiveRows,
  type QuietLiveRows as LiveRows,
} from '@/data/powersync/live-rows';

/** A JSON column as synced (text), or `fallback` when absent or unreadable. */
export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** A synced uuid[] column (`["a","b"]` or Postgres `{a,b}`) as a list. */
export function parseIdList(value: string | null | undefined): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (value.startsWith('{')) {
    const inner = value.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((id) => id.replace(/"/gu, '').trim());
  }
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
}
