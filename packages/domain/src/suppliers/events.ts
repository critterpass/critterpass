/**
 * Supplier domain events (docs/api-contracts.md §4.11). Payloads carry ids and enum values only:
 * never a supplier reference, a product title, a price or a traveller's details.
 */
import { z } from 'zod';

import { VENDOR_EVENT_PAYLOADS, VENDOR_EVENT_TYPES } from '../vendor-comms/events';
import { AFFILIATE_PARTNERS } from './partners';
import { supplierOrderStatusSchema } from './order-state';

export const SUPPLIER_EVENT_TYPES = [
  ...VENDOR_EVENT_TYPES,
  'supplier.link_opened',
  'activity.held',
  'activity.hold_released',
  'activity.hold_expired',
  'hold.expiring',
  'activity.booked',
  'activity.pending',
  'activity.rejected',
  'activity.cancelled',
  'ride.logged',
] as const;
export type SupplierEventType = (typeof SUPPLIER_EVENT_TYPES)[number];

const order = z.object({ trip_id: z.uuid(), order_id: z.uuid() });

export const SUPPLIER_EVENT_PAYLOADS = {
  ...VENDOR_EVENT_PAYLOADS,
  'supplier.link_opened': z.object({
    click_id: z.uuid(),
    trip_id: z.uuid().nullable(),
    partner: z.enum(AFFILIATE_PARTNERS),
  }),
  'activity.held': order.extend({
    hold_provided: z.boolean(),
    status: supplierOrderStatusSchema,
  }),
  'activity.hold_released': order,
  'activity.hold_expired': order,
  // The hold lapses soon: the linked vote closes and the holder hears it.
  'hold.expiring': order.extend({ buyer_id: z.uuid() }),
  'activity.booked': order.extend({ booking_id: z.uuid() }),
  'activity.pending': order,
  'activity.rejected': order,
  'activity.cancelled': order.extend({ refunded: z.boolean() }),
  'ride.logged': z.object({
    trip_id: z.uuid(),
    ride_id: z.uuid(),
    expense_id: z.uuid().nullable(),
  }),
} as const satisfies Record<SupplierEventType, z.ZodType>;
