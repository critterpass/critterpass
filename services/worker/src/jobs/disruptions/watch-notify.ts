/**
 * The watch list's words and its push (N-26): a PLAN B escalation reaches the whole trip at once
 * (`planChanging`); a smaller rise is a line in the evening roundup. The words for changed rows
 * come from the guide (route `watch.copy`), templates otherwise.
 */
import { personaIdSchema, writeWatchCopy, type Gateway } from '@cp/ai';
import { DISRUPTION_PUSH, registerNotificationTrigger } from '@cp/domain';

import { registerNotification } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';
import type { WatchWriter } from './weather-watch';

export function watchWriter(gateway: Pick<Gateway, 'callModel'> | undefined): WatchWriter {
  return async (trip, rows) => {
    const guide = personaIdSchema.safeParse(trip.guide);
    const worst = [...rows].sort((a, b) => b.verdict.score - a.verdict.score)[0];
    const copy = await writeWatchCopy(
      gateway,
      guide.success ? guide.data : 'tokek',
      {
        headline: worst?.verdict.titleTemplate ?? '',
        rows: rows.map((row) => ({
          id: row.id,
          status: row.status,
          facts: row.verdict.facts,
          title: row.verdict.titleTemplate,
          detail: row.verdict.detailTemplate,
        })),
      },
      { tripId: trip.id },
    );
    return copy.rows;
  };
}

let registered = false;

export function registerWatchNotifications(): void {
  if (registered) return;
  registered = true;
  registerNotificationTrigger('watch.escalated', 'watch_escalation');
  registerNotification({
    key: 'watch_escalation',
    event: 'watch.escalated',
    audience: async (tx, routed) => {
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM trip_participants
          WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted') ORDER BY user_id`,
        [str(routed, 'trip_id')],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, routed) {
      const { rows } = await tx.query<{ title: string; detail: string; crew_id: string }>(
        `SELECT w.title, w.detail, t.crew_id FROM watch_items w JOIN trips t ON t.id = w.trip_id
          WHERE w.id = $1`,
        [str(routed, 'watch_item_id')],
      );
      const item = rows[0];
      if (item === undefined) return null;
      return {
        title: DISRUPTION_PUSH.watchTitle,
        body: DISRUPTION_PUSH.watchBody,
        vars: { title: item.title, detail: item.detail },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: item.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: `/trip/${str(routed, 'trip_id') ?? ''}/forecast`,
        classContext: { planChanging: routed.payload['plan_changing'] === true },
      };
    },
    dedupeKey: (routed, uid) =>
      `watch:${str(routed, 'watch_item_id') ?? ''}:${String(routed.payload['status'])}:${uid}`,
  });
}
