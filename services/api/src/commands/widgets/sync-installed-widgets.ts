/**
 * `sync_installed_widgets` (docs/api-contracts.md §4.1): the widgets this install shows right now
 * (kind, size family, the trip or crew each is set to). The server's list for the install becomes
 * exactly the reported one, so a removed widget stops drawing refresh pushes. A configured trip or
 * crew the caller cannot see is refused rather than stored.
 */
import { DomainError, syncInstalledWidgetsPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireOwnDevice } from '../live-activities/shared';

export const syncInstalledWidgetsCommand = defineCommand({
  name: 'sync_installed_widgets',
  v: 1,
  schema: syncInstalledWidgetsPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await asSystemRole(tx, () => requireOwnDevice(tx, ctx.device.id, ctx.uid));
    const tripIds = [...new Set(payload.widgets.flatMap((w) => (w.trip_id ? [w.trip_id] : [])))];
    const crewIds = [...new Set(payload.widgets.flatMap((w) => (w.crew_id ? [w.crew_id] : [])))];
    // Read as the caller: row security decides what they can see.
    const trips = await tx.query('SELECT id FROM trips WHERE id = ANY($1::uuid[])', [tripIds]);
    const crews = await tx.query('SELECT id FROM crews WHERE id = ANY($1::uuid[])', [crewIds]);
    if (trips.rowCount !== tripIds.length || crews.rowCount !== crewIds.length) {
      throw new DomainError('FORBIDDEN', { reason: 'widget_config_not_visible' });
    }
  },
  handle: async (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      await tx.query('DELETE FROM installed_widgets WHERE device_id = $1', [ctx.device.id]);
      for (const widget of payload.widgets) {
        const config = {
          ...(widget.trip_id ? { trip_id: widget.trip_id } : {}),
          ...(widget.crew_id ? { crew_id: widget.crew_id } : {}),
        };
        await tx.query(
          `INSERT INTO installed_widgets (device_id, user_id, kind, family, config)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [ctx.device.id, ctx.uid, widget.kind, widget.family, JSON.stringify(config)],
        );
      }
      return { installed: payload.widgets.length };
    }),
});
