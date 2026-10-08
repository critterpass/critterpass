/**
 * The critter-nearby notification, for travellers whose phone cannot show the Live Activity: Live
 * Activities are off, or no phone of theirs has a push-to-start token from a build that draws it.
 * Everyone else gets the activity instead, never both. It names no place.
 */
import { LA_COPY, passLink, registerNotificationTrigger } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type NotificationRegistration } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';
import { loadEncounter } from './critter';

/** Some phone of the traveller's can be push-started into the critter-nearby activity. */
export async function canShowCritterActivity(tx: pg.PoolClient, uid: string): Promise<boolean> {
  const { rows } = await tx.query<{ can: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM devices d
        WHERE d.user_id = $1 AND d.last_seen_at > now() - interval '30 days'
          AND CASE WHEN d.platform = 'ios'
                   THEN d.la_enabled AND EXISTS (
                     SELECT 1 FROM la_push_to_start_tokens t
                      WHERE t.device_id = d.id AND t.activity_type = 'critter_nearby'
                        AND t.invalid_at IS NULL AND t.drawn)
                   ELSE coalesce((d.capabilities ->> 'live_updates')::boolean, false) AND EXISTS (
                     SELECT 1 FROM push_tokens k
                      WHERE k.device_id = d.id AND k.kind = 'fcm' AND k.invalid_at IS NULL)
              END) AS can`,
    [uid],
  );
  return rows[0]?.can === true;
}

export const critterNearbyNotification: NotificationRegistration = {
  key: 'critter_nearby',
  event: 'encounter.started',
  async audience(tx, event) {
    const encounterId = str(event, 'encounter_id');
    const encounter = encounterId === null ? null : await loadEncounter(tx, encounterId);
    if (encounter === null || encounter.foreground_only || encounter.shown_by_app) return [];
    if (encounter.state !== 'accruing' && encounter.state !== 'ready') return [];
    return (await canShowCritterActivity(tx, encounter.user_id)) ? [] : [encounter.user_id];
  },
  async compose(tx, event) {
    const { rows } = await tx.query<{ slug: string; name: string }>(
      'SELECT g.slug, g.name FROM trips t JOIN guides g ON g.id = t.guide_id WHERE t.id = $1',
      [event.tripId],
    );
    const guide = rows[0];
    return {
      title: LA_COPY.critterStartTitle,
      body: LA_COPY.critterStartBodyPlain,
      sender:
        guide === undefined
          ? DEFAULT_SETUP_GUIDE
          : { kind: 'guide', id: guide.slug, name: guide.name },
      tripId: event.tripId,
      deepLink: passLink(),
    };
  },
};

let registered = false;

export function registerCritterNearbyNotification(): void {
  if (registered) return;
  registered = true;
  registerNotificationTrigger('encounter.started', 'critter_nearby');
  registerNotification(critterNearbyNotification);
}
