/**
 * A proposal opened on the phone (`/proposal/{id}`): the member's own version, or, for the
 * organiser, the RSVP tracker (the organiser reads a member's version with `as`). Opening it once
 * records an open for the crew-level counts only; the member's savings choices travel with I'M IN
 * to the boarding screen, and ASK {GUIDE} opens the private objection sheet.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';

import { recordProposalOpenCommand } from '../data/commands';
import { instantDate } from '../data/format';
import { reasonWhy, type Pick } from '../data/picks';
import { usePicks } from '../data/picks';
import {
  useFindProposalTrip,
  useHype,
  useProposal,
  useReactions,
  useVersions,
} from '../data/proposal';
import { useSavings } from '../data/savings';
import { useProposalTrip } from '../data/trip';
import { ObjectionSheet } from '../objection/objection-sheet';
import { ProposalLoading } from '../proposal-loading';
import { proposalRoutes } from '../routes';
import { HypeBar } from './hype-bar';
import { ShareCard } from './share-card';
import { YourVersionView } from './your-version-view';

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
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [why, setWhy] = useState<Pick | null>(null);
  const [asking, setAsking] = useState(false);
  const opened = useRef(false);
  const viewer = props.as ?? trip?.me ?? null;
  const version = versions.find((v) => v.recipientId === viewer) ?? null;
  const picks = usePicks(tripId ?? '', version?.highlights ?? [], version?.slides ?? []);
  const savings = useSavings(
    tripId ?? '',
    viewer ?? '',
    version?.savingIds ?? [],
    version?.currency ?? null,
  );
  const organiserView = trip?.isOrganiser === true && props.as === undefined;

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
  const guideName = GUIDE_STICKERS[trip.guide].name;
  const person = trip.people.find((p) => p.uid === viewer);
  const organiser = trip.people.find((p) => p.organiser);
  const latest = reactions[0];
  const reactor =
    latest === undefined ? undefined : trip.people.find((p) => p.uid === latest.userId);
  const deadline = proposal.freeCancelUntil ?? proposal.replyBy;
  const chip =
    proposal.freeCancelUntil !== null
      ? t({
          id: 'proposal.version.freeCancel',
          message: `Free cancel till ${instantDate(locale, proposal.freeCancelUntil)}`,
        })
      : deadline === null
        ? null
        : t({
            id: 'proposal.version.replyBy',
            message: `Reply by ${instantDate(locale, deadline)}`,
          });
  const base = version?.shareMinor ?? trip.shareMinor;
  const currency = version?.currency ?? trip.currency;
  const answered =
    person?.rsvp === 'in'
      ? t({ id: 'proposal.version.youreIn', message: 'You’re in. See you there.' })
      : person?.rsvp === 'waitlisted'
        ? t({ id: 'proposal.version.waitlisted', message: 'You’re on the waitlist.' })
        : person?.rsvp === 'out'
          ? t({ id: 'proposal.version.out', message: 'You said you can’t make it.' })
          : null;
  const board = (ids: readonly string[]) => {
    setAsking(false);
    router.push(proposalRoutes.board(props.proposalId, ids));
  };
  return (
    <>
      <YourVersionView
        name={person?.name ?? ''}
        preview={props.as !== undefined && props.as !== trip.me}
        guide={trip.guide}
        chip={chip}
        pending={version === null || version.status === 'pending'}
        fallbackNote={version?.fallbackNote ?? null}
        picks={picks}
        when={(pick) =>
          pick.dayNo === null ? '' : t({ id: 'proposal.version.day', message: `Day ${pick.dayNo}` })
        }
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
            latest={
              latest === undefined || reactor === undefined
                ? null
                : { name: reactor.name, kind: latest.kind }
            }
          />
        }
        answered={answered}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onPick={setWhy}
        onIn={() => board(chosen)}
        onAsk={() => setAsking(true)}
      />
      {why === null ? null : (
        <Sheet title={why.title} detents={['medium']} onDismiss={() => setWhy(null)}>
          <Text variant="body">{reasonWhy(why.reasonTag, guideName)}</Text>
        </Sheet>
      )}
      {asking ? (
        <ObjectionSheet
          proposalId={props.proposalId}
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
          onBoard={board}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  );
}
