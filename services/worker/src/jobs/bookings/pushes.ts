/**
 * The import candidate line (N-13, a roundup line): a candidate shown to the crew reaches every
 * other active member ("Found a booking in Maya’s email"); a mailbox find kept private reaches its
 * owner. Pastes and scans are the user's own, answered in the app, so they send nothing.
 */
import { BOOKING_PUSH } from '@cp/domain';

import { registerNotification } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, firstName, str } from '../setup/facts';

export function registerFoundPush(): void {
  registerNotification({
    key: 'bookings_found',
    event: 'import.candidate_created',
    async audience(tx, routed) {
      if (str(routed, 'status') !== 'pending') return [];
      const { rows } = await tx.query<{
        user_id: string;
        crew_id: string | null;
        crew_visible: boolean;
        source: string;
      }>('SELECT user_id, crew_id, crew_visible, source FROM import_candidates WHERE id = $1', [
        str(routed, 'candidate_id'),
      ]);
      const candidate = rows[0];
      if (candidate === undefined) return [];
      if (!candidate.crew_visible || candidate.crew_id === null) {
        return candidate.source === 'mailbox' ? [candidate.user_id] : [];
      }
      const members = await tx.query<{ user_id: string }>(
        "SELECT user_id FROM crew_members WHERE crew_id = $1 AND status = 'active' AND user_id <> $2",
        [candidate.crew_id, candidate.user_id],
      );
      return members.rows.map((row) => row.user_id);
    },
    async compose(tx, routed) {
      const { rows } = await tx.query<{
        user_id: string;
        crew: string | null;
        title: string | null;
      }>(
        `SELECT i.user_id, c.name AS crew, i.extracted->>'title' AS title
           FROM import_candidates i LEFT JOIN crews c ON c.id = i.crew_id
          WHERE i.id = $1 AND i.status = 'pending'`,
        [str(routed, 'candidate_id')],
      );
      const row = rows[0];
      if (row === undefined) return null;
      return {
        title: BOOKING_PUSH.foundTitle,
        body: BOOKING_PUSH.foundBody,
        vars: {
          crew: row.crew ?? 'CritterPass',
          member: await firstName(tx, row.user_id),
          title: row.title ?? '',
        },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: routed.tripId,
        deepLink: '/wallet/bookings/add',
      };
    },
  });
}
