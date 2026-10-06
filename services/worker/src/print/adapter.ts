/**
 * The print partner seam: placing a postcard order for one recipient, reading an order's progress
 * back, and cancelling one. The partner's own callbacks are never trusted; status only ever comes
 * from `getStatus`. Swapping printers means another implementation of this interface.
 */
import type { MailingAddressFields, PostcardMailingStatus } from '@cp/domain';

export interface PrintOrderInput {
  /** Our reference, `{mailing_id}:{recipient_id}`; also the idempotency key of the order. */
  readonly reference: string;
  readonly address: MailingAddressFields;
  /** Print-ready PNGs at 300 dpi, readable by the printer for days. */
  readonly frontUrl: string;
  readonly backUrl: string;
  /** Where the printer calls back when the order moves (our webhook, path token included). */
  readonly callbackUrl?: string | undefined;
}

export interface PrintOrderStatus {
  readonly status: PostcardMailingStatus;
  readonly carrier?: string | undefined;
  readonly trackingUrl?: string | undefined;
  /** ISO date the card should arrive, when the printer says. */
  readonly eta?: string | undefined;
}

export interface PrintOrderPlaced extends PrintOrderStatus {
  readonly ref: string;
}

/** The printer refused the order for good (bad address, unsupported product): never retried. */
export class PrintOrderRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrintOrderRejected';
  }
}

export interface PrintVendor {
  readonly name: string;
  createOrder(input: PrintOrderInput): Promise<PrintOrderPlaced>;
  getStatus(ref: string): Promise<PrintOrderStatus>;
  cancel(ref: string): Promise<void>;
}
