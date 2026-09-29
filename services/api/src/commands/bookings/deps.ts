/**
 * What the booking commands need at runtime: the field-encryption keyring barcodes are sealed with
 * (without it a barcode cannot be stored, and the rest of the booking still can).
 */
import { crypto as dbCrypto } from '@cp/db';
import { DomainError, type BarcodeInput } from '@cp/domain';

export type FieldKeyring = Parameters<typeof dbCrypto.encryptField>[1];

export interface BookingCommandDeps {
  readonly keyring?: FieldKeyring | undefined;
}

/** Seals a scanned barcode; refuses when the server holds no encryption key. */
export function sealBarcode(
  deps: BookingCommandDeps,
  barcode: BarcodeInput | undefined,
): { format: string; payloadEnc: string } | null {
  if (barcode === undefined) return null;
  if (deps.keyring === undefined) {
    throw new DomainError('STATE_INVALID', { reason: 'barcode_storage_unavailable' });
  }
  return {
    format: barcode.format,
    payloadEnc: dbCrypto.encryptField(barcode.payload, deps.keyring),
  };
}
