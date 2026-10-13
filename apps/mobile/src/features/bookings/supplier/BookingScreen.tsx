/**
 * The booking sheet's flow: `hold_activity` → traveller details → Viator's payment form →
 * `book_activity`. The order's own row (synced `supplier_orders`) drives the result, so a booking
 * the operator confirms later moves from "Waiting for the operator" to "Booked" by itself.
 */
import { BookingSheet } from './BookingSheet';
import type { SupplierApi } from './data/api';
import { PaymentWebView } from './PaymentWebView';
import { useBookingFlow, type BookParams } from './use-booking-flow';

export type { BookParams } from './use-booking-flow';

export function BookingScreen({
  params,
  api,
}: {
  readonly params: BookParams;
  readonly api?: SupplierApi;
}) {
  const { payUrl, onPaid, ...flow } = useBookingFlow(params, api);
  return (
    <BookingSheet
      {...flow}
      payment={payUrl ? <PaymentWebView url={payUrl} onResult={onPaid} /> : null}
    />
  );
}
