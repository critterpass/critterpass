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
import { feedback, toast } from '@/motion';

import { lockProposalCommand } from '../data/commands';
import { instantDate, instantDateTime } from '../data/format';
import { useFindProposalTrip, useProposal } from '../data/proposal';
import { useProposalTrip, type CrewPerson } from '../data/trip';
import { ProposalConfirm } from '../confirm-sheet';
import { ProposalLoading } from '../proposal-loading';
import { proposalRoutes } from '../routes';
import { lockState, publicStatus, tally } from './model';
import { Suggestions } from './suggestions';
import { TrackerView } from './tracker-view';

export function TrackerScreen({ proposalId }: { readonly proposalId: string }) {
  const proposal = useProposal(proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const locale = useLocale();
  const lock = useCommand(lockProposalCommand);
  const [asking, setAsking] = useState(false);
  const member = trip != null && !trip.isOrganiser;

  useEffect(() => {
    if (member) router.replace(proposalRoutes.open(proposalId));
  }, [member, proposalId]);

  if (proposal == null || trip == null || member) {
    return <ProposalLoading testID="tracker-loading" />;
  }
  const sentLine = proposal.sentAt
    ? t({ id: 'proposal.tracker.sent', message: `Sent ${instantDate(locale, proposal.sentAt)}` })
    : t({ id: 'proposal.tracker.notSent', message: 'Not sent yet' });
  const line = (person: CrewPerson): string => {
    const at = person.repliedAt === null ? '' : instantDateTime(locale, person.repliedAt);
    switch (publicStatus(person)) {
      case 'organiser':
        return sentLine;
      case 'in':
        return t({ id: 'proposal.tracker.boarded', message: `Boarded ${at}` });
      case 'maybe':
        return t({ id: 'proposal.tracker.saidMaybe', message: 'Said maybe' });
      case 'out':
        return t({ id: 'proposal.tracker.cantMake', message: 'Can’t make it' });
      case 'waitlisted':
        return t({ id: 'proposal.tracker.waitlisted', message: 'On the waitlist' });
      case 'no_reply':
        return sentLine;
    }
  };
  const recipients = trip.people.filter((p) => !p.organiser);
  const state = lockState(proposal.status, recipients);
  const counts = tally(trip.people);
  const deadline = proposal.freeCancelUntil ?? proposal.replyBy;
  const onLock = async () => {
    setAsking(false);
    const result = await lock.send({ proposal_id: proposal.id });
    if (result.kind === 'applied') {
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
        back={t({ id: 'proposal.tracker.back', message: `${trip.destination} proposal` })}
        chip={
          proposal.status === 'locked'
            ? t({ id: 'proposal.tracker.confirmed', message: 'Confirmed' })
            : deadline === null
              ? null
              : proposal.freeCancelUntil !== null
                ? t({
                    id: 'proposal.tracker.freeCancel',
                    message: `Free cancel till ${instantDate(locale, deadline)}`,
                  })
                : t({
                    id: 'proposal.tracker.replyBy',
                    message: `Reply by ${instantDate(locale, deadline)}`,
                  })
        }
        rows={trip.people.map((p) => ({
          uid: p.uid,
          name:
            p.uid === trip.me
              ? t({ id: 'proposal.tracker.you', message: `${p.name} (you)` })
              : p.name,
          joinIndex: p.joinIndex,
          status: publicStatus(p),
          line: line(p),
        }))}
        tally={counts}
        suggestions={
          proposal.status === 'sent' ? (
            <Suggestions proposalId={proposal.id} guide={trip.guide} />
          ) : null
        }
        lockLabel={
          state.kind === 'ready' ? t({ id: 'proposal.lock.cta', message: 'Lock it in' }) : null
        }
        lockNote={
          state.kind === 'nobody_in'
            ? t({
                id: 'proposal.lock.nobody',
                message: 'You can lock the trip in once someone says they’re in.',
              })
            : state.kind === 'locked'
              ? t({ id: 'proposal.lock.locked', message: 'Locked in. The trip is confirmed.' })
              : null
        }
        locking={lock.pending}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onLock={() => setAsking(true)}
      />
      {asking && state.kind === 'ready' ? (
        <ProposalConfirm
          title={t({ id: 'proposal.lock.title', message: 'Lock the crew in?' })}
          consequences={[
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
          ]}
          confirmLabel={t({ id: 'proposal.lock.confirmYes', message: 'Yes, lock it in' })}
          mode="button"
          onConfirm={() => void onLock()}
          onCancel={() => setAsking(false)}
          testID="tracker-lock-confirm"
        />
      ) : null}
    </>
  );
}
