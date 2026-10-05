/** The first stop still ahead that she has not said she is done with (a stop done early). */
export function firstNotDone<Row extends { readonly stable_id: string }>(
  rows: readonly Row[],
  said: ReadonlyMap<string, 'here' | 'done'>,
): Row | null {
  return rows.find((row) => said.get(row.stable_id) !== 'done') ?? null;
}
