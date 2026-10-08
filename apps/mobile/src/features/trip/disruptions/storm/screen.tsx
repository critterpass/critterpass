/**
 * The storm screen (3k-8) over synced rows: the storm disruption found by its decision poll, the
 * poll and its ballots (the count is live through sync), the crew, and the booked seat's original
 * booker. A vote is the queued `cast_ballot`; the crew decider closes it on the server. The
 * booker's Confirm & pay holds the new date (`hold_storm_seats`, online) and opens the wallet,
 * where the held booking is paid.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { generateUuidV7 } from '@cp/domain';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { useGuideText } from '@/lib/i18n/guide-text';
import { goBackOr } from '@/lib/navigation/back';
import { openInTabs } from '@/lib/navigation/open-in-tabs';
import { useCommandFeedback } from '@/motion/island-toast';

import { useLiveRows, useOwnerUid } from '../../hub/data/live-rows';
import { guideName, guideOr } from '../../hub/guide';
import { forecastHref } from '../../hub/hub-disruptions';
import { walletHref } from '../../hub/hub-links';
import { TRIPS_TAB } from '../../hub/routes';
import { castStormBallotCommand, holdStormSeatsCommand } from '../commands';
import { stormModel, type BallotRowData, type PollRowData, type StormRowData } from './model';
import { StormView } from './storm-view';

const STORM_SQL = `SELECT d.id, d.trip_id, d.status, d.cause, d.title, d.summary, d.facts, d.options,
    d.source_snapshot, d.chosen_option_id, d.i18n
  FROM disruptions d WHERE d.decision_poll_id = ? AND d.kind = 'storm'
  ORDER BY d.created_at DESC LIMIT 1`;
const POLL_SQL = `SELECT id, status, eligible_voter_ids, closes_at, winner_option_id
  FROM polls WHERE id = ?`;
const BALLOTS_SQL = `SELECT user_id, option_id FROM ballots WHERE poll_id = ? ORDER BY cast_at`;
const TRIP_SQL = `SELECT t.crew_id, coalesce(t.tz, d.tz, 'UTC') AS tz, g.slug AS guide_slug,
    g.name AS guide_name
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN guides g ON g.id = t.guide_id WHERE t.id = ?`;
const CREW_SQL = `SELECT m.user_id AS id, coalesce(u.display_name, '') AS name
  FROM crew_members m LEFT JOIN users u ON u.id = m.user_id
  WHERE m.crew_id = ? AND m.status = 'active' ORDER BY m.created_at, m.user_id`;
const BOOKER_SQL = `SELECT buyer_id FROM supplier_orders WHERE id = ?`;

interface TripRow {
  readonly crew_id: string;
  readonly tz: string;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
}

export function StormScreen({ pollId }: { readonly pollId: string }) {
  const me = useOwnerUid();
  const syncPhase = useSyncPhase();
  const words = useGuideText();
  const storm = useLiveRows<StormRowData>(STORM_SQL, [pollId], ['disruptions']);
  const row = storm.rows[0] ?? null;
  const poll = useLiveRows<PollRowData>(POLL_SQL, [pollId], ['polls']).rows[0] ?? null;
  const ballots = useLiveRows<BallotRowData>(BALLOTS_SQL, [pollId], ['ballots']).rows;
  const trip = useLiveRows<TripRow>(TRIP_SQL, row === null ? null : [row.trip_id], [
    'trips',
    'destinations',
    'guides',
  ]).rows[0];
  const people = useLiveRows<{ id: string; name: string }>(
    CREW_SQL,
    trip === undefined ? null : [trip.crew_id],
    ['crew_members', 'users'],
  ).rows;
  const orderId = useMemo(() => {
    if (row?.source_snapshot == null) return null;
    try {
      const snapshot = JSON.parse(row.source_snapshot) as { order_id?: string | null };
      return snapshot.order_id ?? null;
    } catch {
      return null;
    }
  }, [row]);
  const buyer = useLiveRows<{ buyer_id: string }>(BOOKER_SQL, orderId === null ? null : [orderId], [
    'supplier_orders',
  ]).rows[0];
  const vote = useCommand(castStormBallotCommand);
  const hold = useCommand(holdStormSeatsCommand);
  const { report } = useCommandFeedback();
  const [sending, setSending] = useState(false);
  const model = useMemo(
    () => (row === null ? null : stormModel(row, poll, ballots, me)),
    [row, poll, ballots, me],
  );
  const guide = guideOr(trip?.guide_slug);
  const booker =
    buyer === undefined
      ? null
      : {
          id: buyer.buyer_id,
          name: people.find((p) => p.id === buyer.buyer_id)?.name ?? '',
          me: buyer.buyer_id === me,
        };
  return (
    <StormView
      state={!storm.loaded ? 'loading' : model === null ? 'missing' : 'ready'}
      model={model}
      title={row === null ? '' : (words('disruption', row, 'title') ?? row.title)}
      line={row === null ? '' : (words('disruption', row, 'summary') ?? row.summary)}
      tz={trip?.tz ?? 'UTC'}
      guide={guide}
      guideName={guideName(guide, trip?.guide_name)}
      offline={syncPhase === 'offline'}
      people={people}
      booker={booker}
      sending={sending}
      onBack={() => goBackOr(row === null ? TRIPS_TAB : forecastHref(row.trip_id))}
      onVote={(id) => {
        const option = model?.options.find((o) => o.id === id);
        if (option === undefined || sending) return;
        setSending(true);
        void vote
          .send({ poll_id: pollId, option_id: option.poll_option_id })
          .then((sent) => report(sent, { offlineCapable: true, id: `storm-vote-${pollId}` }))
          .finally(() => setSending(false));
      }}
      onConfirmPay={() => {
        if (row === null || sending) return;
        setSending(true);
        void hold
          .send({ disruption_id: row.id, hold_id: generateUuidV7() })
          .then((sent) => {
            // Bookings opens only once the seats are really held; otherwise the screen stays.
            if (report(sent, { id: `storm-hold-${row.id}` }) !== 'done') return;
            openInTabs(walletHref(row.trip_id, 'bookings'));
          })
          .finally(() => setSending(false));
      }}
    />
  );
}
