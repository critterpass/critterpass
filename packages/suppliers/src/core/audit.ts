/**
 * `ops.supplier_calls` writer (packages/db/migrations/*_supplier_calls.sql): one row per attempt,
 * metadata only. The endpoint is a fixed label chosen by the adapter (`prices_for_dates`), never
 * the request URL, so keys and query values can never reach the table. The writer takes the
 * service's own system-role query function, so this package stays free of the database layer.
 */

export type SupplierCallOutcome = 'ok' | 'http_error' | 'timeout' | 'network_error';

export interface SupplierCallRecord {
  readonly supplier: string;
  readonly endpoint: string;
  readonly method: string;
  readonly attempt: number;
  readonly outcome: SupplierCallOutcome;
  readonly status: number | null;
  readonly latencyMs: number;
  readonly costUnits: number;
}

export type SupplierCallAudit = (record: SupplierCallRecord) => Promise<void>;

/** Runs one statement as the system role (`withSystem` in the calling service). */
export type SystemQuery = (sql: string, params: readonly unknown[]) => Promise<unknown>;

export const SUPPLIER_CALL_INSERT_SQL = `INSERT INTO ops.supplier_calls
  (supplier, endpoint, method, attempt, outcome, status, latency_ms, cost_units)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

export function supplierCallParams(record: SupplierCallRecord): readonly unknown[] {
  return [
    record.supplier,
    record.endpoint,
    record.method,
    record.attempt,
    record.outcome,
    record.status,
    Math.max(0, Math.round(record.latencyMs)),
    record.costUnits,
  ];
}

/** Audit rows are best-effort: a failed audit write never fails the supplier call itself. */
export function createSqlSupplierCallAudit(
  query: SystemQuery,
  onError: (error: unknown) => void = () => undefined,
): SupplierCallAudit {
  return async (record) => {
    try {
      await query(SUPPLIER_CALL_INSERT_SQL, supplierCallParams(record));
    } catch (error) {
      onError(error);
    }
  };
}

/** For callers with no database (scripts, unit tests of adapters). */
export const noSupplierCallAudit: SupplierCallAudit = () => Promise.resolve();
