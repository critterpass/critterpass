/** The day's packing list: shared crew rows and each member's personal rows. */
import { z } from 'zod';

export const PACKING_LABEL_MAX = 80;

export const checkPackingItemPayloadSchema = z.object({
  item_id: z.uuid(),
  checked: z.boolean(),
});
export type CheckPackingItemPayload = z.infer<typeof checkPackingItemPayloadSchema>;

export const addPackingItemPayloadSchema = z.object({
  /** Client-made id, so an offline add and its later check agree on the row. */
  item_id: z.uuid(),
  trip_id: z.uuid(),
  day: z.iso.date().optional(),
  label: z.string().trim().min(1).max(PACKING_LABEL_MAX),
  /** Personal rows are the caller's alone; shared rows are the crew's. */
  personal: z.boolean(),
});
export type AddPackingItemPayload = z.infer<typeof addPackingItemPayloadSchema>;

export const removePackingItemPayloadSchema = z.object({ item_id: z.uuid() });
export type RemovePackingItemPayload = z.infer<typeof removePackingItemPayloadSchema>;
