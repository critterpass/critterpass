/**
 * The organiser's RSVP tracker wired to the phone: the crew's public statuses as they sync, the
 * guide's suggestions, and LOCK IT IN, which asks first (the maybes go on the waitlist, whoever
 * didn't answer is out) and then confirms the trip on the server. A member who opens it goes to
 * their own version instead.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { feedback, toast } from '@/motion';
import { TextButton } from '@/ui/premium';

import { seatBoost } from '../crowd/boost-slot';
import { PremiumCrowdSheet } from '../premium/crowd-sheet';
import { lockProposalCommand } from '../data/commands';
import { fixesLine, useFixesToMake } from '../data/known-issues';
import { useFindProposalTrip, useProposal } from '../data/proposal';
import { useLiveRows } from '../data/rows';
import { useProposalTrip } from '../data/trip';
import { askToLock } from '../premium/proposal-alerts';
import { PremiumConfirmedCard, PremiumSuggestions } from '../premium/tracker-cards';
import { ProposalLoading } from '../proposal-loading';
import {
  failedLine,
  lockConfirmLabel,
  lockConsequences,
  lockCopy,
  lockTitle,
  trackerBack,
  trackerChip,
  trackerLine,
  trackerName,
  tripLine,
} from '../labels';
import { proposalRoutes } from '../routes';
import { lockState, publicStatus, tally } from './model';
import type { ReactNode } from 'react';
import type { PublicStatus, Tally } from './model';

/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
const DROPOUTS_SQL = 'SELECT user_id FROM trip_dropouts WHERE trip_id = ? AND resolved_at IS NULL';
const CAP_SQL = 'SELECT seat_cap FROM trip_entitlements WHERE trip_id = ?';
/* eslint-enable lingui/no-unlocalized-strings */

export function TrackerScreen({
  proposalId,
  View,
}: {
  readonly proposalId: string;
  /** How the tracker is drawn; the logic stays here. */
  readonly View: ComponentType<TrackerViewProps>;
}) {
  const proposal = useProposal(proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const locale = useLocale();
  const lock = useCommand(lockProposalCommand);
  const [crowd, setCrowd] = useState(false);
  const dropouts = useLiveRows<{ user_id: string }>(
    DROPOUTS_SQL,
    tripId === null ? null : [tripId],
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a table name, never copy.
    ['trip_dropouts'],
  );
  const cap = useLiveRows<{ seat_cap: number | null }>(
    CAP_SQL,
    tripId === null ? null : [tripId],
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a table name, never copy.
    ['trip_entitlements'],
  ).rows[0]?.seat_cap;
  // The server's answer to LOCK shows at once; the synced proposal row follows.
  const [lockedNow, setLockedNow] = useState(false);
  const member = trip != null && !trip.isOrganiser;
  const lockIssues = fixesLine(useFixesToMake(proposal?.tripId ?? null), true);

  useEffect(() => {
    if (member) router.replace(proposalRoutes.open(proposalId));
  }, [member, proposalId]);

  if (proposal == null || trip == null || member) {
    return (
      <ProposalLoading
        missing={!member && (proposal === null || trip === null)}
        testID="tracker-loading"
      />
    );
  }
  const recipients = trip.people.filter((p) => !p.organiser);
  const status = lockedNow ? 'locked' : proposal.status;
  const state = lockState(status, recipients);
  const counts = tally(trip.people);
  const copy = lockCopy(state);
  const planHref = hrefFor('plan-hub', { tripId: trip.tripId });
  const pending = new Set(dropouts.rows.map((d) => d.user_id));
  const waiting = trip.people.filter((p) => p.rsvp === 'waitlisted');
  const boost = seatBoost();
  const onLock = async () => {
    const result = await lock.send({ proposal_id: proposal.id });
    if (result.kind === 'applied') {
      // The locked-in card ("The trip is on") is the confirmation: no toast over its header.
      setLockedNow(true);
      feedback.emit('success');
    } else {
      feedback.emit('error');
      toast.show({
        id: 'proposal-lock-failed',
        title: t({ id: 'proposal.lock.failed', message: 'Couldn’t lock it in' }),
        subtitle: failedLine(result),
      });
    }
  };
  // LOCK IT IN asks first: the maybes go on the waitlist and whoever didn't answer is out.
  const askFirst = async () => {
    if (state.kind !== 'ready' && state.kind !== 'alone') return;
    const consequences = [...lockConsequences(state), ...(lockIssues === null ? [] : [lockIssues])];
    if (await askToLock(lockTitle(state.kind === 'alone'), consequences, lockConfirmLabel())) {
      void onLock();
    }
  };
  return (
    <>
      <View
        back={trackerBack(trip)}
        chip={trackerChip(locale, status === 'locked', proposal.freeCancelUntil, proposal.replyBy)}
        rows={trip.people.map((p) => ({
          uid: p.uid,
          name: trackerName(p, p.uid === trip.me),
          joinIndex: p.joinIndex,
          status: publicStatus(p),
          line: pending.has(p.uid)
            ? t({ id: 'proposal.tracker.seeChanges', message: 'Can’t make it · see what changes' })
            : trackerLine(locale, p, proposal.sentAt),
          ...(pending.has(p.uid)
            ? { onPress: () => router.push(proposalRoutes.dropout(proposal.id, p.uid)) }
            : {}),
        }))}
        waiting={
          waiting.length === 0 ? null : (
            <TextButton
              label={t({
                id: 'proposal.tracker.waiting',
                message: `${waiting.length} waiting for a seat`,
              })}
              onPress={() => setCrowd(true)}
              testID="tracker-waiting"
            />
          )
        }
        tally={counts}
        confirmed={
          state.kind === 'locked' ? (
            <PremiumConfirmedCard
              guide={trip.guide}
              going={counts.in}
              tripLine={tripLine(locale, trip.destination, trip.startDate, trip.endDate)}
              onPlan={planHref === undefined ? undefined : () => router.push(planHref)}
            />
          ) : null
        }
        suggestions={
          status === 'sent' ? (
            <PremiumSuggestions proposalId={proposal.id} guide={trip.guide} />
          ) : null
        }
        lockLabel={copy.label}
        lockNote={copy.note}
        locking={lock.pending}
        onBack={() => goBackOr()}
        onLock={() => void askFirst()}
      />
      {crowd ? (
        <PremiumCrowdSheet
          destination={trip.destination}
          cap={cap ?? trip.people.length - waiting.length}
          seated={trip.people.filter((p) => p.rsvp !== 'waitlisted' && p.rsvp !== 'out')}
          waiting={waiting}
          onBoost={boost === null ? null : () => boost(trip.tripId)}
          onClose={() => setCrowd(false)}
        />
      ) : null}
    </>
  );
}

export interface TrackerRow {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly status: PublicStatus;
  readonly line: string;
  /** Opens the row's follow-up (a dropout's change list). */
  readonly onPress?: () => void;
}

export interface TrackerViewProps {
  readonly back: string;
  readonly chip: string | null;
  readonly rows: readonly TrackerRow[];
  readonly tally: Tally;
  readonly suggestions: ReactNode;
  /** The crowd link when someone waits for a seat (4f-1). */
  readonly waiting?: ReactNode;
  /** The locked-in card, once the trip is confirmed. */
  readonly confirmed?: ReactNode;
  /** The lock button's label, or null when locking isn't offered. */
  readonly lockLabel: string | null;
  readonly lockNote: string | null;
  readonly locking: boolean;
  readonly onBack: () => void;
  readonly onLock: () => void;
}
