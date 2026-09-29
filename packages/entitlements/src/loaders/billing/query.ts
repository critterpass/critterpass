/**
 * The one thing a billing loader needs from the server: run a parameterised read in the
 * recompute's own transaction. Loaders stay free of any database driver (this package is shared
 * with the app); the server adapts its transaction to this shape when it registers them.
 */
export type RunQuery = <Row>(sql: string, values: readonly unknown[]) => Promise<readonly Row[]>;

export const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();
