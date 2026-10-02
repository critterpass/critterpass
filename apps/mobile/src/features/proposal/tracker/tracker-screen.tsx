/**
 * The organiser's RSVP tracker wired to the phone: the crew's public statuses as they sync, the
 * guide's suggestions, and LOCK IT IN, which asks first (the maybes go on the waitlist, whoever
 * didn't answer is out) and then confirms the trip on the server. A member who opens it goes to
 * their own version instead.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { feedback, toast } from '@/motion';
import { TextLink } from '@/ui/buttons/TextLink';

import { seatBoost } from '../crowd/boost-slot';
import { CrowdSheet } from '../crowd/crowd-sheet';
import { lockProposalCommand } from '../data/commands';
import { useFindProposalTrip, useProposal } from '../data/proposal';
import { useLiveRows } from '../data/rows';
import { useProposalTrip } from '../data/trip';
import { ProposalConfirm } from '../confirm-sheet';
import { ProposalLoading } from '../proposal-loading';
import { lockCopy, trackerBack, trackerChip, trackerLine, trackerName, tripLine } from '../labels';
import { proposalRoutes } from '../routes';
import { ConfirmedCard } from './confirmed-card';
import { lockState, publicStatus, tally } from './model';
import { Suggestions } from './suggestions';
import { TrackerView } from './tracker-view';

/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
const DROPOUTS_SQL = 'SELECT user_id FROM trip_dropouts WHERE trip_id = ? AND resolved_at IS NULL';
const CAP_SQL = 'SELECT seat_cap FROM trip_entitlements WHERE trip_id = ?';
/* eslint-enable lingui/no-unlocalized-strings */

export function TrackerScreen({ proposalId }: { readonly proposalId: string }) {
  const proposal = useProposal(proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const locale = useLocale();
  const lock = useCommand(lockProposalCommand);
  const [asking, setAsking] = useState(false);
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

  useEffect(() => {
    if (member) router.replace(proposalRoutes.open(proposalId));
  }, [member, proposalId]);

  if (proposal == null || trip == null || member) {
    return <ProposalLoading testID="tracker-loading" />;
  }
  const recipients = trip.people.filter((p) => !p.organiser);
  const status = lockedNow ? 'locked' : proposal.status;
  const state = lockState(status, recipients);
  const counts = tally(trip.people);
  const copy = lockCopy(state);
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a design screen id, never copy.
  const planHref = hrefFor('3e-1', { tripId: trip.tripId });
  const pending = new Set(dropouts.rows.map((d) => d.user_id));
  const waiting = trip.people.filter((p) => p.rsvp === 'waitlisted');
  const boost = seatBoost();
  const onLock = async () => {
    setAsking(false);
    const result = await lock.send({ proposal_id: proposal.id });
    if (result.kind === 'applied') {
      setLockedNow(true);
      feedback.emit('success');
      toast.show({
        id: 'proposal-locked',
        title: t({ id: 'proposal.lock.done', message: 'Locked in. The trip is confirmed.' }),
      });
    } else {
      feedback.emit('error');
      toast.show({
        id: 'proposal-lock-failed',
        title: t({ id: 'proposal.lock.failed', message: 'Couldn’t lock it in' }),
        subtitle: t({
          id: 'proposal.lock.failedSub',
          message: 'Check your connection and try again.',
        }),
      });
    }
  };
  return (
    <>
      <TrackerView
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
            <TextLink
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
            <ConfirmedCard
              guide={trip.guide}
              going={counts.in}
              tripLine={tripLine(locale, trip.destination, trip.startDate, trip.endDate)}
              onPlan={planHref === undefined ? undefined : () => router.push(planHref)}
            />
          ) : null
        }
        suggestions={
          status === 'sent' ? <Suggestions proposalId={proposal.id} guide={trip.guide} /> : null
        }
        lockLabel={copy.label}
        lockNote={copy.note}
        locking={lock.pending}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onLock={() => setAsking(true)}
      />
      {asking && (state.kind === 'ready' || state.kind === 'alone') ? (
        <ProposalConfirm
          title={
            state.kind === 'alone'
              ? t({ id: 'proposal.alone.title', message: 'Lock the plan in?' })
              : t({ id: 'proposal.lock.title', message: 'Lock the crew in?' })
          }
          consequences={
            state.kind === 'alone'
              ? [
                  t({
                    id: 'proposal.lock.alone',
                    message:
                      'Everyone else said they can’t make it, so it’s just you. The trip is confirmed, and friends who join later land on this plan.',
                  }),
                ]
              : [
                  t({
                    id: 'proposal.lock.going',
                    message: `${state.going + 1} going, the trip is confirmed.`,
                  }),
                  ...(state.maybes > 0
                    ? [
                        t({
                          id: 'proposal.lock.maybes',
                          message: `${state.maybes} maybe go on the waitlist for a freed seat.`,
                        }),
                      ]
                    : []),
                  ...(state.silent > 0
                    ? [
                        t({
                          id: 'proposal.lock.silent',
                          message: `${state.silent} who haven’t answered are out.`,
                        }),
                      ]
                    : []),
                ]
          }
          confirmLabel={t({ id: 'proposal.lock.confirmYes', message: 'Yes, lock it in' })}
          mode="button"
          onConfirm={() => void onLock()}
          onCancel={() => setAsking(false)}
          testID="tracker-lock-confirm"
        />
      ) : null}
      {crowd ? (
        <CrowdSheet
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
