/**
 * Time zone ids are stored in canonical IANA form. Apple platforms report CLDR ids such as
 * `Asia/Saigon`, `Asia/Calcutta` or `Asia/Katmandu`, which are IANA backward-compatibility links;
 * Postgres builds without Debian's tzdata-legacy (the test image, possibly production) reject them.
 * Every write boundary maps them to the zone they name (`Asia/Ho_Chi_Minh`, `Asia/Kolkata`, ...).
 * The database applies the same mapping (`app.canonical_tz`) in triggers for direct SQL writers.
 */
import { z } from 'zod';

import { TZ_ALIASES } from './tz-aliases';

/**
 * Shape of a canonical IANA id: `Area/Location[/Sub]` segments starting upper-case, or one of the
 * `Etc/GMT±N` fixed offsets. Rules out abbreviations (`ICT`), POSIX strings (`UTC+3`) and ids
 * carrying an offset suffix (`Asia/Tokyo+5`), all of which Postgres would otherwise accept.
 * Mirrored by `app.valid_tz` in packages/db/migrations.
 */
export const CANONICAL_TZ_PATTERN =
  /^(?:Etc\/GMT(?:-(?:1[0-4]|[1-9])|\+(?:1[0-2]|[1-9]))|[A-Z][A-Za-z_-]*(?:\/[A-Z][A-Za-z_-]*){1,2})$/;

/** Maps a backward-compatibility alias to its canonical IANA id; any other input is returned as is. */
export function canonicalTz(tz: string): string {
  return TZ_ALIASES.get(tz) ?? tz;
}

/** An IANA time zone id, canonicalized on parse (`Asia/Saigon` parses to `Asia/Ho_Chi_Minh`). */
export const timeZoneIdSchema = z
  .string()
  .min(1)
  .overwrite(canonicalTz)
  .regex(CANONICAL_TZ_PATTERN, 'must be an IANA time zone id such as Asia/Ho_Chi_Minh');
