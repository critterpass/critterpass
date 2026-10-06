/**
 * What a place search reads of its destination: which rows the destination covers (its own, and
 * a neighbour's inside an overlapping place box) and the words of its name, which say where and
 * not what when typed after a place's name.
 */
import type pg from 'pg';

/**
 * A destination covers its own rows and, where its place box overlaps another destination's, the
 * rows that destination owns inside the box: a source place is stored once, owned by the first
 * destination ingested. Without an overlap the filter stays a plain `destination_id` match, so a
 * metro's browse never pays for a spatial scan of its whole box.
 */
export async function destinationCondition(
  tx: pg.PoolClient,
  destinationId: string,
  params: unknown[],
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT o.id FROM destinations d
     JOIN destinations o ON o.id <> d.id AND ST_Intersects(o.place_bounds, d.place_bounds)
     WHERE d.id = $1`,
    [destinationId],
  );
  params.push(destinationId);
  const destinationParam = params.length;
  if (rows.length === 0) return `p.destination_id = $${destinationParam}`;
  params.push(rows.map((row) => row.id));
  const overlapParam = params.length;
  return `(p.destination_id = $${destinationParam} OR (p.destination_id = ANY($${overlapParam}::uuid[])
    AND ST_Intersects(p.location, (SELECT place_bounds FROM destinations WHERE id = $${destinationParam}))))`;
}

export const foldWord = (word: string) =>
  word.replace(/[đĐ]/gu, 'd').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** The words of a destination's name, folded ("da", "lat"); none without a destination. */
export async function destinationWords(
  tx: pg.PoolClient,
  destinationId: string | undefined,
): Promise<ReadonlySet<string>> {
  if (destinationId === undefined) return new Set();
  const { rows } = await tx.query<{ name: string }>('SELECT name FROM destinations WHERE id = $1', [
    destinationId,
  ]);
  return new Set(
    (rows[0]?.name ?? '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map(foldWord),
  );
}
