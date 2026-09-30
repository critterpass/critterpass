/**
 * The api's supplier HTTP client: every attempt is audited in `ops.supplier_calls` on its own
 * system connection (never inside the caller's command transaction, so a rolled-back command still
 * leaves its audit row), best-effort.
 */
import { withSystem } from '@cp/db';
import {
  createSqlSupplierCallAudit,
  createSupplierHttp,
  type FetchLike,
  type SupplierHttp,
} from '@cp/suppliers';
import type pg from 'pg';

export function createAuditedSupplierHttp(
  pool: pg.Pool,
  onAuditError: (error: unknown) => void = () => undefined,
  fetch?: FetchLike,
): SupplierHttp {
  return createSupplierHttp({
    audit: createSqlSupplierCallAudit(
      (sql, params) => withSystem(pool, (tx) => tx.query(sql, [...params])),
      onAuditError,
    ),
    ...(fetch === undefined ? {} : { fetch }),
  });
}
