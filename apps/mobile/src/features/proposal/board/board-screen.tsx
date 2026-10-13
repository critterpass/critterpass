/**
 * Slide to board wired to the phone. Boarding sends `set_rsvp{in}` with the savings the member
 * took; online it waits for the seat answer (a full trip keeps the reply as a waitlist place and
 * says so), offline it queues and the pass shows as pending. MAYBE answers at once; "I can't make
 * it" asks first, since going out frees the seat and starts the crew's re-split. A member who is
 * already in reaches the same question from their version, through `decline=1`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { feedback, toast } from '@/motion';

import { rememberAnswer } from '../data/answered-here';
import { setRsvpCommand, setRsvpQueuedCommand } from '../data/commands';
import { wholeMoney } from '../data/format';
import { useFindProposalTrip, useProposal, useVersions } from '../data/proposal';
import { useLiveRows } from '../data/rows';
import { useProposalTrip } from '../data/trip';
import { ProposalLoading } from '../proposal-loading';
import { tripDates, tripLine } from '../labels';
import { proposalRoutes } from '../routes';
import { boardOutcome, arrivalCode, type BoardOutcome } from './model';
import { askGoingOut, showWaitlisted } from '../premium/proposal-alerts';
import { type StackMember } from '@/ui/people/AvatarStack';
import type { GuideStickerId as GuideId } from '@/ui/premium/stickers/guides';

const EXTRA_SQL = `SELECT c.name AS crew_name, u.home_airport FROM trips t
  JOIN crews c ON c.id = t.crew_id
  LEFT JOIN users u ON u.id = ?
  WHERE t.id = ?`;

export function BoardScreen(props: {
  /** How the pass is drawn; the logic stays here. */
  readonly View: ComponentType<BoardViewProps>;
  readonly proposalId: string;
  readonly options: readonly string[];
  /** Opens on the decline question (a member who already said IN). */
  readonly decline?: boolean;
}) {
  const Look = props.View;
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
  const reply = async (status: 'in' | 'maybe' | 'out') => {
    const payload = { proposal_id: props.proposalId, status, option_ids: props.options };
    let next = boardOutcome(await now.send(payload));
    if (next.kind === 'unreachable') next = boardOutcome(await queued.send(payload));
    setOutcome(next);
    // The member's version shows the answer at once, before the participant row syncs back.
    if (next.kind === 'boarded' || next.kind === 'pending' || next.kind === 'answered') {
      rememberAnswer(props.proposalId, status);
    }
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
      goBackOr(proposalRoutes.open(props.proposalId));
    }
  };
  const toPlan = () => goBackOr(proposalRoutes.open(props.proposalId));
  // "I can't make it" asks first: going out frees the seat and starts the crew's re-split.
  const askOut = async () => {
    if (await askGoingOut()) void reply('out');
    // Opened only to ask this question: thinking again returns to the plan, not the pass.
    else if (props.decline === true) toPlan();
  };
  const asked = useRef(false);
  const ready = proposal != null && trip != null;
  // Opened only to ask whether they can't make it after all: ask once, as soon as it can answer.
  useEffect(() => {
    if (!ready || props.decline !== true || asked.current) return;
    asked.current = true;
    void askOut();
  });
  useEffect(() => {
    if (outcome?.kind !== 'waitlisted') return;
    void showWaitlisted(outcome.position, outcome.cap).then(() =>
      router.replace(proposalRoutes.open(props.proposalId)),
    );
  }, [outcome, props.proposalId]);

  if (proposal == null || trip == null) {
    return (
      <ProposalLoading
        missing={proposal === null || trip === null}
        fallback={proposalRoutes.open(props.proposalId)}
        testID="board-loading"
      />
    );
  }
  const me = trip.people.find((p) => p.uid === trip.me);
  const version = versions.find((v) => v.recipientId === trip.me);
  const share = version?.shareMinor ?? trip.shareMinor;
  const currency = version?.currency ?? trip.currency;
  const boarded = outcome?.kind === 'boarded' || outcome?.kind === 'pending' || me?.rsvp === 'in';
  const inCount = trip.people.filter((p) => p.rsvp === 'in').length;
  const shownIn = me?.rsvp !== 'in' && boarded ? inCount + 1 : inCount;
  const seatNo = Math.max(1, trip.people.findIndex((p) => p.uid === trip.me) + 1);
  const row = extra.rows[0];

  return (
    <Look
      guide={trip.guide}
      eyebrow={tripLine(locale, trip.destination, trip.startDate, trip.endDate)}
      name={me?.name ?? ''}
      crewIn={trip.people
        .filter((p) => p.rsvp === 'in')
        .map((p) => ({ key: p.uid, name: p.name, joinIndex: p.joinIndex }))}
      counter={`${shownIn}/${trip.people.length}`}
      boarded={boarded}
      pending={outcome?.kind === 'pending'}
      ticket={{
        from: row?.home_airport?.toUpperCase() ?? '—',
        to: arrivalCode(trip.destinationSlug, trip.destination),
        passenger: me?.fullName ?? '',
        dates: tripDates(locale, trip.startDate, trip.endDate),
        share:
          share === null || currency === null || !proposal.showCost
            ? null
            : wholeMoney(locale, share, currency),
        group: row?.crew_name ?? '',
        seat: `A${String(seatNo).padStart(2, '0')}`,
      }}
      onBoard={() => void reply('in')}
      onMaybe={() => void reply('maybe')}
      onOut={() => void askOut()}
      onBack={toPlan}
      onDone={() => router.replace(proposalRoutes.open(props.proposalId))}
    />
  );
}

export interface BoardViewProps {
  readonly guide: GuideId;
  readonly eyebrow: string;
  readonly name: string;
  readonly crewIn: readonly StackMember[];
  readonly counter: string;
  readonly boarded: boolean;
  readonly pending: boolean;
  readonly ticket: {
    readonly from: string;
    readonly to: string;
    readonly passenger: string;
    readonly dates: string;
    readonly share: string | null;
    readonly group: string;
    readonly seat: string;
  };
  readonly onBoard: () => void;
  readonly onMaybe: () => void;
  readonly onOut: () => void;
  /** Leaves the pass without answering, back to the member's version. */
  readonly onBack: () => void;
  readonly onDone: () => void;
}
