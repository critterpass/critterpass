/**
 * Proposal pushes: N-07 each recipient's version (from the trip's guide), N-08 a follow-up or
 * resend that came due (to its one member) and N-09 a day before reply-by (to members who have not
 * answered, and the organisers). Copy never says anything is held: nothing is until the crew books.
 * Registering them also registers the proposal's inbox items (./inbox.ts).
 */
import { proposalLink } from '@cp/domain';
import type pg from 'pg';

import {
  registerNotification,
  type NotificationSender,
  type RoutedEvent,
} from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';
import { registerProposalInboxFanouts } from './inbox';
import { registerTripNewsNotifications } from './trip-news';

export const PROPOSAL_PUSH = {
  versionTitle: /*i18n*/ {
    id: 'notifications.proposal.version_title',
    message: '{guide} wrote your version of {place}',
  },
  versionBody: /*i18n*/ {
    id: 'notifications.proposal.version_body',
    message: 'Watch the trip, then tell the crew if you are in.',
  },
  followupTitle: /*i18n*/ {
    id: 'notifications.proposal.followup_title',
    message: 'Still thinking about {place}?',
  },
  followupBody: /*i18n*/ {
    id: 'notifications.proposal.followup_body',
    message: 'You asked me to check in. Take another look?',
  },
  resendTitle: /*i18n*/ {
    id: 'notifications.proposal.resend_title',
    message: 'Your crew planned {place}',
  },
  resendBody: /*i18n*/ {
    id: 'notifications.proposal.resend_body',
    message: 'Take a look when you have a minute.',
  },
  replyByTitle: /*i18n*/ {
    id: 'notifications.proposal.reply_by_title',
    message: 'Reply by tomorrow · {place}',
  },
  replyByBody: /*i18n*/ {
    id: 'notifications.proposal.reply_by_body',
    message: 'The crew needs your answer by {date}.',
  },
} as const;

interface TripFacts {
  readonly crew_id: string;
  readonly place: string;
  readonly guide: NotificationSender;
}

async function tripFacts(tx: pg.PoolClient, tripId: string | null): Promise<TripFacts | null> {
  const { rows } = await tx.query<{
    crew_id: string;
    place: string | null;
    slug: string | null;
    name: string | null;
  }>(
    `SELECT t.crew_id, d.name AS place, g.slug, g.name FROM trips t
       LEFT JOIN destinations d ON d.id = t.destination_id LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    crew_id: row.crew_id,
    place: row.place ?? '',
    guide:
      row.slug !== null && row.name !== null
        ? { kind: 'guide', id: row.slug, name: row.name }
        : DEFAULT_SETUP_GUIDE,
  };
}

let registered = false;

export function registerProposalNotifications(): void {
  if (registered) return;
  registered = true;
  registerTripNewsNotifications();
  registerProposalInboxFanouts();

  registerNotification({
    key: 'proposal_version',
    event: 'proposal.sent',
    async audience(tx, routed: RoutedEvent) {
      const { rows } = await tx.query<{ recipient_id: string }>(
        'SELECT recipient_id FROM proposal_versions WHERE proposal_id = $1',
        [str(routed, 'proposal_id')],
      );
      return rows.map((row) => row.recipient_id);
    },
    async compose(tx, routed) {
      const trip = await tripFacts(tx, str(routed, 'trip_id') ?? null);
      if (trip === null) return null;
      return {
        title: PROPOSAL_PUSH.versionTitle,
        body: PROPOSAL_PUSH.versionBody,
        vars: { guide: trip.guide.name, place: trip.place },
        sender: trip.guide,
        crewId: trip.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: proposalLink(str(routed, 'proposal_id') ?? ''),
        // The poster's I'M IN and MAYBE answer this proposal without opening the app.
        ctx: { proposal_id: str(routed, 'proposal_id') },
        needsYou: true,
      };
    },
  });

  registerNotification({
    key: 'scheduled_resend',
    event: 'followup.due',
    async audience(tx, routed) {
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM proposal_followups WHERE id = $1`,
        [str(routed, 'followup_id')],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, routed) {
      const trip = await tripFacts(tx, str(routed, 'trip_id') ?? null);
      const { rows } = await tx.query<{ kind: string }>(
        'SELECT kind FROM proposal_followups WHERE id = $1',
        [str(routed, 'followup_id')],
      );
      if (trip === null || rows[0] === undefined) return null;
      const resend = rows[0].kind === 'resend';
      return {
        title: resend ? PROPOSAL_PUSH.resendTitle : PROPOSAL_PUSH.followupTitle,
        body: resend ? PROPOSAL_PUSH.resendBody : PROPOSAL_PUSH.followupBody,
        vars: { place: trip.place },
        sender: trip.guide,
        crewId: trip.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: proposalLink(str(routed, 'proposal_id') ?? ''),
      };
    },
  });

  registerNotification({
    key: 'reply_by_expiring',
    event: 'proposal.reply_by_soon',
    audience: (_tx, routed) => {
      const ids = routed.payload['user_ids'];
      return Promise.resolve(
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
      );
    },
    async compose(tx, routed) {
      const trip = await tripFacts(tx, str(routed, 'trip_id') ?? null);
      const { rows } = await tx.query<{ reply_by: string }>(
        `SELECT to_char(reply_by, 'Mon DD') AS reply_by FROM proposals WHERE id = $1`,
        [str(routed, 'proposal_id')],
      );
      if (trip === null || rows[0] === undefined) return null;
      return {
        title: PROPOSAL_PUSH.replyByTitle,
        body: PROPOSAL_PUSH.replyByBody,
        vars: { place: trip.place, date: rows[0].reply_by },
        sender: trip.guide,
        crewId: trip.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: proposalLink(str(routed, 'proposal_id') ?? ''),
        ctx: { proposal_id: str(routed, 'proposal_id') },
        needsYou: true,
        collapseVars: { trip_id: str(routed, 'trip_id') ?? '' },
      };
    },
  });
}
