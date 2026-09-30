/**
 * Supplier failures in the wire vocabulary (docs/api-contracts.md §3): a call past its deadline is
 * `UPSTREAM_TIMEOUT`, an upstream that is down, overloaded or switched off is
 * `SUPPLIER_UNAVAILABLE` (the client falls back to the partner link), and a business refusal is
 * `SUPPLIER_REJECTED` with the supplier's own code. Nothing from the upstream body is copied into
 * the error beyond that code.
 */
import { DomainError } from '@cp/domain';

import { SupplierTimeoutError } from './egress';
import { SupplierHttpError } from './http';

/** A business refusal from the supplier (`BOOKABLE_ITEM_IS_NO_LONGER_AVAILABLE`, ...). */
export function supplierRejected(supplier: string, supplierCode: string): DomainError {
  return new DomainError('SUPPLIER_REJECTED', { supplier, supplier_code: supplierCode });
}

/** The adapter is off (flag) or not configured: the caller shows the partner link instead. */
export function supplierUnavailable(supplier: string, reason: string): DomainError {
  return new DomainError('SUPPLIER_UNAVAILABLE', { supplier, reason });
}

function timedOut(error: unknown): boolean {
  return (
    error instanceof SupplierTimeoutError ||
    (error instanceof SupplierHttpError && error.cause instanceof SupplierTimeoutError)
  );
}

/** Maps anything an adapter throws to the error the command or route answers with. */
export function toSupplierDomainError(error: unknown, supplier: string): DomainError {
  if (error instanceof DomainError) return error;
  if (timedOut(error)) return new DomainError('UPSTREAM_TIMEOUT', { supplier });
  // A refused key is our configuration, not the traveller's request: the link fallback applies.
  if (error instanceof SupplierHttpError && (error.status === 401 || error.status === 403)) {
    return supplierUnavailable(supplier, 'credentials');
  }
  if (error instanceof SupplierHttpError && error.status !== null && !error.retryable) {
    return new DomainError('SUPPLIER_REJECTED', {
      supplier,
      supplier_code: `http_${error.status}`,
    });
  }
  return supplierUnavailable(supplier, 'upstream');
}
