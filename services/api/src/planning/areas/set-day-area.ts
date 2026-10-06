/**
 * `set_day_area`: the organiser spends a day of the plan in an area a day trip from that day's
 * stop leads to. Online only; organiser only; behind `trip.areas`.
 */
import { setDayAreaPayloadSchema, type DayAreaResult } from '@cp/domain';

import { defineCommand } from '../../commands/_framework/define-command';
import { requireOrganiser } from '../../commands/setup/shared';
import { changeDayArea } from './day-area-change';

export const setDayAreaCommand = defineCommand({
  name: 'set_day_area',
  v: 1,
  schema: setDayAreaPayloadSchema,
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
      areaId: payload.destination_id,
      uid: ctx.uid,
    }),
});
