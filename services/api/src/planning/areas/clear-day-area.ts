/**
 * `clear_day_area`: the day goes back to being spent at its stop; the area's places on it go back
 * to Ideas. Online only; organiser only; behind `trip.areas`.
 */
import { clearDayAreaPayloadSchema, type DayAreaResult } from '@cp/domain';

import { defineCommand } from '../../commands/_framework/define-command';
import { requireOrganiser } from '../../commands/setup/shared';
import { changeDayArea } from './day-area-change';

export const clearDayAreaCommand = defineCommand({
  name: 'clear_day_area',
  v: 1,
  schema: clearDayAreaPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: (tx, payload, ctx): Promise<DayAreaResult> =>
    changeDayArea(tx, {
      tripId: payload.trip_id,
      baseVersion: payload.base_version,
      dayNo: payload.day_no,
      areaId: null,
      uid: ctx.uid,
    }),
});
