/**
 * One guide row per released critter. The database creates the rows (`app.sync_critter_guides`);
 * the caller supplies each critter's look, computed from the critter's own colours. Callers run as
 * `app_system`.
 */
import type pg from 'pg';

export interface GuideLookRow {
  /** `#rrggbb`, lowercase. */
  readonly accent: string;
  /** The named colour older readers know. */
  readonly colour: string;
}

/** A released critter as the look function sees it: its name's slug and its own colours. */
export type GuideLookFor = (critter: {
  readonly key: string;
  readonly name: string;
  readonly colours: readonly string[] | null;
}) => GuideLookRow;

function ownColours(artParams: unknown): readonly string[] | null {
  if (typeof artParams !== 'object' || artParams === null) return null;
  const colours = (artParams as { c?: unknown }).c;
  if (!Array.isArray(colours)) return null;
  return colours.filter((colour): colour is string => typeof colour === 'string');
}

/**
 * Creates or updates the guide of every released critter. Runs after a critters or sets release;
 * returns the number of guide rows written.
 */
export async function syncCritterGuides(tx: pg.PoolClient, lookFor: GuideLookFor): Promise<number> {
  const { rows } = await tx.query<{ key: string; name: string; art_params: unknown }>(
    `SELECT c.key, n.name, c.art_params
       FROM critters c
       JOIN critter_names n ON n.critter_id = c.id AND n.form_id IS NULL AND n.locale = 'en'`,
  );
  if (rows.length === 0) return 0;
  const looks = Object.fromEntries(
    rows.map((row) => [
      row.key,
      lookFor({ key: row.key, name: row.name, colours: ownColours(row.art_params) }),
    ]),
  );
  const result = await tx.query<{ written: number }>(
    'SELECT app.sync_critter_guides($1::jsonb) AS written',
    [JSON.stringify(looks)],
  );
  return result.rows[0]?.written ?? 0;
}
