/**
 * A proposal opened on the phone (`/proposal/{id}`): the member's own version, or, for the
 * organiser, the RSVP tracker (the organiser reads a member's version with `as`). Opening it once
 * records an open for the crew-level counts only; the member's savings choices travel with I'M IN
 * to the boarding screen, MAYBE answers here, "I can't make it" asks first on the pass, and ASK
 * {GUIDE} opens the private objection sheet. An answer given on this phone shows at once, before
 * its row syncs back.
 */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { guideSticker } from '@/ui/avatar/guides';
import { toast } from '@/motion/island-toast';

import { boardOutcome } from '../board/model';
import { rememberAnswer, standingAnswer } from '../data/answered-here';
import { recordProposalOpenCommand, setRsvpCommand, setRsvpQueuedCommand } from '../data/commands';
import { instantDate } from '../data/format';
import { pickTag, reasonWhy, useGroupPicks, usePicks, type Pick } from '../data/picks';
import {
  useFindProposalTrip,
  useHype,
  useProposal,
  useReactions,
  useVersions,
} from '../data/proposal';
import { useSavings } from '../data/savings';
import { useProposalTrip } from '../data/trip';
import { useHasWishes } from '../data/wishes';
import { ObjectionSheet } from '../objection/objection-host';
import { ProposalLoading } from '../proposal-loading';
import { stopWhen, tripLine, versionChip } from '../labels';
import { proposalRoutes } from '../routes';
import { HypeBar } from './hype-bar';
import { ShareCard } from './share-card';
import { WhySheet } from './why-sheet';
import { YourVersionView } from './your-version-view';

/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
/** The place's own page, for a stop that has a place on file. */
function placeHrefOf(pick: Pick, tripId: string): Href | undefined {
  if (pick.poiId == null) return undefined;
  const params = { placeId: pick.poiId, tripId };
  return hrefFor('7e-1', params) ?? hrefFor('3d-3', params);
}

/** The stop's day in the plan, where a stop takes a note or a question. */
function dayHrefOf(pick: Pick, tripId: string): Href | undefined {
  return pick.dayNo === null ? undefined : hrefFor('3e-2', { tripId, day: String(pick.dayNo) });
}
/* eslint-enable lingui/no-unlocalized-strings */

/** Closes the sheet, then opens `href`; undefined when there is nowhere to go. */
function opener(href: Href | undefined, close: () => void): (() => void) | undefined {
  if (href === undefined) return undefined;
  return () => {
    close();
    router.push(href);
  };
}

export function YourVersionScreen(props: { readonly proposalId: string; readonly as?: string }) {
  const proposal = useProposal(props.proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const versions = useVersions(proposal?.id ?? null);
  const hype = useHype(props.proposalId);
  const reactions = useReactions(props.proposalId);
  const locale = useLocale();
  const open = useCommand(recordProposalOpenCommand);
  const rsvpNow = useCommand(setRsvpCommand);
  const rsvpQueued = useCommand(setRsvpQueuedCommand);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [, setAnsweredHere] = useState(0);
  const [why, setWhy] = useState<Pick | null>(null);
  const [asking, setAsking] = useState(false);
  const opened = useRef(false);
  const viewer = props.as ?? trip?.me ?? null;
  const version = versions.find((v) => v.recipientId === viewer) ?? null;
  const personal = usePicks(tripId ?? '', version?.highlights ?? [], version?.slides ?? []);
  const fromPlan = useGroupPicks(tripId ?? '');
  // The crew's shared version (or one with no picks of its own) shows the plan's own highlights.
  const group = version !== null && (version.shared || personal.length === 0);
  const picks = group ? fromPlan : personal;
  const savings = useSavings(
    tripId ?? '',
    viewer ?? '',
    version?.savingIds ?? [],
    version?.currency ?? null,
  );
  const organiserView = trip?.isOrganiser === true && props.as === undefined;
  const hasWishes = useHasWishes(tripId, viewer);

  useEffect(() => {
    if (organiserView) router.replace(proposalRoutes.tracker(props.proposalId));
  }, [organiserView, props.proposalId]);

  useEffect(() => {
    if (opened.current || trip == null || trip.isOrganiser || proposal?.sentAt == null) return;
    opened.current = true;
    void open.send({
      proposal_id: props.proposalId,
      kind: 'open',
      local_hour: new Date().getHours(),
    });
  }, [open, proposal, props.proposalId, trip]);

  if (proposal === undefined || proposal === null || trip === undefined || trip === null) {
    return <ProposalLoading testID="version-loading" />;
  }
  if (organiserView) return <ProposalLoading testID="version-loading" />;
  const guideName = guideSticker(trip.guide).name;
  const person = trip.people.find((p) => p.uid === viewer);
  const organiser = trip.people.find((p) => p.organiser);
  const latest = reactions[0];
  const reactor =
    latest === undefined ? undefined : trip.people.find((p) => p.uid === latest.userId);
  const chip = versionChip(locale, proposal.freeCancelUntil, proposal.replyBy);
  const base = version?.shareMinor ?? trip.shareMinor;
  const currency = version?.currency ?? trip.currency;
  const preview = props.as !== undefined && props.as !== trip.me;
  const reader = { uid: viewer, hasWishes, guideName };
  // Only the reader's own answer is theirs to see changed here; a preview shows none.
  const answer = preview ? null : standingAnswer(person?.rsvp, props.proposalId);
  const sayMaybe = async () => {
    const payload = { proposal_id: props.proposalId, status: 'maybe' as const, option_ids: chosen };
    let outcome = boardOutcome(await rsvpNow.send(payload));
    if (outcome.kind === 'unreachable') outcome = boardOutcome(await rsvpQueued.send(payload));
    if (outcome.kind === 'refused' || outcome.kind === 'unreachable') {
      toast.show({
        id: 'proposal-board-refused',
        title: t({ id: 'proposal.board.refused', message: 'Your reply didn’t go through' }),
        subtitle: t({ id: 'proposal.board.refusedSub', message: 'Try again in a moment.' }),
      });
      return;
    }
    rememberAnswer(props.proposalId, 'maybe');
    setAnsweredHere((n) => n + 1);
    toast.show({
      id: 'proposal-answered-maybe',
      title: t({ id: 'proposal.board.maybeDone', message: 'You said maybe' }),
    });
  };
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a design screen id, never copy.
  const planHref = hrefFor('3e-1', { tripId: trip.tripId });
  const board = (ids: readonly string[]) => {
    setAsking(false);
    router.push(proposalRoutes.board(props.proposalId, ids));
  };
  return (
    <>
      <YourVersionView
        name={person?.name ?? ''}
        preview={preview}
        personalised={!group && hasWishes}
        organiser={organiser?.uid === viewer ? '' : (organiser?.name ?? '')}
        guide={trip.guide}
        chip={chip}
        pending={version === null || version.status === 'pending'}
        fallbackNote={version?.fallbackNote ?? null}
        group={group}
        tripLine={tripLine(locale, trip.destination, trip.startDate, trip.endDate)}
        onPlan={planHref === undefined ? undefined : () => router.push(planHref)}
        picks={picks}
        when={(pick) => stopWhen(locale, pick)}
        // The crew's shared picks carry tags about the stop, never a claim about the reader.
        tag={(pick) => pickTag(pick, group ? { ...reader, hasWishes: true } : reader)}
        share={
          base === null || currency === null || !proposal.showCost ? null : (
            <ShareCard
              locale={locale}
              baseMinor={base}
              currency={currency}
              savings={savings}
              chosen={chosen}
              onToggle={(id, on) =>
                setChosen(on ? [...chosen, id] : chosen.filter((c) => c !== id))
              }
            />
          )
        }
        hype={
          <HypeBar
            hype={hype}
            organiser={organiser?.name ?? ''}
            latest={
              latest === undefined || reactor === undefined
                ? null
                : { name: reactor.name, kind: latest.kind }
            }
          />
        }
        answer={answer}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onPick={(pick) => {
          if (!group) {
            setWhy(pick);
            return;
          }
          // A group stop opens its day in the plan.
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a design screen id.
          const day = hrefFor('3e-2', { tripId: trip.tripId, day: String(pick.dayNo ?? 1) });
          if (day !== undefined) router.push(day);
        }}
        onIn={() => board(chosen)}
        onMaybe={() => void sayMaybe()}
        onOut={() => router.push(proposalRoutes.decline(props.proposalId))}
        onAsk={() => setAsking(true)}
      />
      {why === null ? null : (
        <WhySheet
          pick={why}
          when={stopWhen(locale, why)}
          reason={reasonWhy(why, reader)}
          onPlace={opener(placeHrefOf(why, trip.tripId), () => setWhy(null))}
          onDay={opener(dayHrefOf(why, trip.tripId), () => setWhy(null))}
          onDismiss={() => setWhy(null)}
        />
      )}
      {asking ? (
        <ObjectionSheet
          proposalId={props.proposalId}
          guide={trip.guide}
          guideName={guideName}
          organiserName={organiser?.name ?? ''}
          locale={locale}
          baseMinor={base}
          currency={currency}
          freeCancelLine={
            proposal.freeCancelUntil === null
              ? null
              : t({
                  id: 'proposal.objection.freeCancel',
                  message: `Free cancellation until ${instantDate(locale, proposal.freeCancelUntil)}`,
                })
          }
          replyBy={proposal.replyBy}
          onOpenPlan={
            planHref === undefined
              ? undefined
              : () => {
                  setAsking(false);
                  router.push(planHref);
                }
          }
          onBoard={board}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}
