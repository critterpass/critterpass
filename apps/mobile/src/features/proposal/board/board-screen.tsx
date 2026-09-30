/**
 * Slide to board wired to the phone. Boarding sends `set_rsvp{in}` with the savings the member
 * took; online it waits for the seat answer (a full trip keeps the reply as a waitlist place and
 * says so), offline it queues and the pass shows as pending. MAYBE answers at once; "I can't make
 * it" asks first, since going out frees the seat and starts the crew's re-split.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { feedback, toast } from '@/motion';

import { setRsvpCommand, setRsvpQueuedCommand } from '../data/commands';
import { dayRange, wholeMoney } from '../data/format';
import { useFindProposalTrip, useProposal, useVersions } from '../data/proposal';
import { useLiveRows } from '../data/rows';
import { useProposalTrip } from '../data/trip';
import { ProposalConfirm } from '../confirm-sheet';
import { ProposalLoading } from '../proposal-loading';
import { proposalRoutes } from '../routes';
import { boardOutcome, placeCode, type BoardOutcome } from './model';
import { BoardView } from './board-view';
import { SeatSheet } from './seat-sheet';

const EXTRA_SQL = `SELECT c.name AS crew_name, u.home_airport FROM trips t
  JOIN crews c ON c.id = t.crew_id
  LEFT JOIN users u ON u.id = ?
  WHERE t.id = ?`;

export function BoardScreen(props: {
  readonly proposalId: string;
  readonly options: readonly string[];
}) {
  const proposal = useProposal(props.proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const versions = useVersions(proposal?.id ?? null);
  const extra = useLiveRows<{ crew_name: string | null; home_airport: string | null }>(
    EXTRA_SQL,
    trip == null ? null : [trip.me, trip.tripId],
    ['trips', 'crews', 'users'],
  );
  const locale = useLocale();
  const now = useCommand(setRsvpCommand);
  const queued = useCommand(setRsvpQueuedCommand);
  const [outcome, setOutcome] = useState<BoardOutcome | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  if (proposal == null || trip == null) return <ProposalLoading testID="board-loading" />;
  const me = trip.people.find((p) => p.uid === trip.me);
  const version = versions.find((v) => v.recipientId === trip.me);
  const share = version?.shareMinor ?? trip.shareMinor;
  const currency = version?.currency ?? trip.currency;
  const boarded = outcome?.kind === 'boarded' || outcome?.kind === 'pending' || me?.rsvp === 'in';
  const inCount = trip.people.filter((p) => p.rsvp === 'in').length;
  const shownIn = me?.rsvp !== 'in' && boarded ? inCount + 1 : inCount;
  const seatNo = Math.max(1, trip.people.findIndex((p) => p.uid === trip.me) + 1);
  const row = extra.rows[0];

  const reply = async (status: 'in' | 'maybe' | 'out') => {
    const payload = { proposal_id: props.proposalId, status, option_ids: props.options };
    let next = boardOutcome(await now.send(payload));
    if (next.kind === 'unreachable') next = boardOutcome(await queued.send(payload));
    setOutcome(next);
    if (next.kind === 'boarded') feedback.emit('success');
    if (next.kind === 'refused') {
      feedback.emit('error');
      toast.show({
        id: 'proposal-board-refused',
        title: t({ id: 'proposal.board.refused', message: 'Your reply didn’t go through' }),
        subtitle: t({ id: 'proposal.board.refusedSub', message: 'Try again in a moment.' }),
      });
    }
    if (next.kind === 'answered' || (next.kind === 'pending' && status !== 'in')) {
      toast.show({
        id: `proposal-answered-${status}`,
        title:
          status === 'maybe'
            ? t({ id: 'proposal.board.maybeDone', message: 'You said maybe' })
            : t({ id: 'proposal.board.outDone', message: 'The crew knows you can’t make it' }),
      });
      router.back();
    }
  };

  return (
    <>
      <BoardView
        guide={trip.guide}
        eyebrow={[
          trip.destination,
          trip.startDate && trip.endDate ? dayRange(locale, trip.startDate, trip.endDate) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        name={me?.name ?? ''}
        crewIn={trip.people
          .filter((p) => p.rsvp === 'in')
          .map((p) => ({ key: p.uid, name: p.name, joinIndex: p.joinIndex }))}
        counter={`${shownIn}/${trip.people.length}`}
        boarded={boarded}
        pending={outcome?.kind === 'pending'}
        ticket={{
          from: row?.home_airport?.toUpperCase() ?? '···',
          to: placeCode(trip.destination),
          passenger: me?.fullName ?? '',
          dates:
            trip.startDate && trip.endDate ? dayRange(locale, trip.startDate, trip.endDate) : '',
          share:
            share === null || currency === null || !proposal.showCost
              ? null
              : wholeMoney(locale, share, currency),
          group: row?.crew_name ?? '',
          seat: `A${String(seatNo).padStart(2, '0')}`,
        }}
        onBoard={() => void reply('in')}
        onMaybe={() => void reply('maybe')}
        onOut={() => setConfirmOut(true)}
        onDone={() => router.replace(proposalRoutes.open(props.proposalId))}
      />
      {outcome?.kind === 'waitlisted' ? (
        <SeatSheet
          position={outcome.position}
          cap={outcome.cap}
          onClose={() => router.replace(proposalRoutes.open(props.proposalId))}
        />
      ) : null}
      {confirmOut ? (
        <ProposalConfirm
          title={t({ id: 'proposal.out.title', message: 'Tell the crew you can’t make it?' })}
          consequences={[
            t({ id: 'proposal.out.seat', message: 'Your seat goes to whoever is waiting.' }),
            t({
              id: 'proposal.out.resplit',
              message: 'Shared costs are split again without you, once the organiser applies it.',
            }),
          ]}
          confirmLabel={t({ id: 'proposal.out.confirm', message: 'I can’t make it' })}
          mode="button"
          onConfirm={() => {
            setConfirmOut(false);
            void reply('out');
          }}
          onCancel={() => setConfirmOut(false)}
          testID="board-out-confirm"
        />
      ) : null}
    </>
  );
}
