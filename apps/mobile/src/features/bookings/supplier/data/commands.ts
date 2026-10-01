/**
 * Client specs for the supplier commands. A partner click and a ride log may wait in the offline
 * queue (the click's bridge link works as soon as it syncs); holds, bookings, cancels and vendor
 * messages need the supplier or the desk to answer, so they go online.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  ApproveVendorMessagePayload,
  BookActivityPayload,
  CancelActivityBookingPayload,
  HoldActivityPayload,
  LogRidePayload,
  RecordSupplierClickPayload,
  ReleaseActivityHoldPayload,
  RequestVendorMessagePayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

/** Online first: the click is on the server before the bridge link opens. */
export const recordClickOnline = defineClientCommand<RecordSupplierClickPayload>({
  name: 'record_supplier_click',
  offline: false,
});

/** Offline: queued; the bridge redirects once it syncs. */
export const recordClickQueued = defineClientCommand<RecordSupplierClickPayload>({
  name: 'record_supplier_click',
  offline: true,
  summarize: () => msg({ id: 'suppliers.queued.click', message: 'A partner link you opened' }),
});

export const logRideCommand = defineClientCommand<LogRidePayload>({
  name: 'log_ride',
  offline: true,
  summarize: () => msg({ id: 'suppliers.queued.ride', message: 'A ride you logged' }),
});

export const holdActivityCommand = defineClientCommand<HoldActivityPayload>({
  name: 'hold_activity',
  offline: false,
});

export const bookActivityCommand = defineClientCommand<BookActivityPayload>({
  name: 'book_activity',
  offline: false,
});

export const releaseHoldCommand = defineClientCommand<ReleaseActivityHoldPayload>({
  name: 'release_activity_hold',
  offline: false,
});

export const cancelBookingCommand = defineClientCommand<CancelActivityBookingPayload>({
  name: 'cancel_activity_booking',
  offline: false,
});

export const requestVendorMessageCommand = defineClientCommand<RequestVendorMessagePayload>({
  name: 'request_vendor_message',
  offline: false,
});

export const approveVendorMessageCommand = defineClientCommand<ApproveVendorMessagePayload>({
  name: 'approve_vendor_message',
  offline: false,
});
