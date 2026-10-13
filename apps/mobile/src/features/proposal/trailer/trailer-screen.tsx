/**
 * The proposal trailer (3f-2): the member's version as a story ({GUIDE} PRESENTS, the trip line,
 * ✕), five-second slides with the headline stamping in, the crew's public reactions floating up
 * the side as they sync (lifted above the slide's words), quick replies that assume nothing about
 * the plan's hours (OKAY WOW, ON FIRE, I'M IN) and post a reaction, and
 * I'M IN (to boarding) or MAYBE (to the member's version, where all three answers and the guide
 * are). Slides about a stop play in the plan's order. The story
 * holds while the quick replies are open. With no slides written yet it goes straight to the version.
 */
/* eslint-disable lingui/no-unlocalized-strings -- reaction kinds are wire values, never copy. */
import type { ProposalReaction } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';

import { reactProposalCommand } from '../data/commands';
import { useStopTimes } from '../data/picks';
import { useFindProposalTrip, useProposal, useReactions, useVersions } from '../data/proposal';
import { useProposalTrip } from '../data/trip';
import { ProposalLoading } from '../proposal-loading';
import { stopWhen, tripLine } from '../labels';
import { proposalRoutes } from '../routes';
import { reactionWords } from '../your-version/hype-bar';
import { slidesInPlanOrder } from './slide-order';
import { replyPanelAfter, storyHeld } from './story-hold';
import { TrailerView, type TrailerViewProps } from './trailer-view';

/** Replies that fit any slide: none of them assumes what time a stop is. */
const QUICK: readonly ProposalReaction[] = ['okay_wow', 'fire', 'im_in'];

export function TrailerScreen({
  proposalId,
  View: Look = TrailerView,
}: {
  readonly proposalId: string;
  /** How the trailer is drawn; the reads and the reactions stay here. @default the current look */
  readonly View?: ComponentType<TrailerViewProps>;
}) {
  const proposal = useProposal(proposalId);
  useFindProposalTrip(proposal);
  const tripId = proposal?.tripId ?? null;
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const versions = useVersions(proposal?.id ?? null);
  const reactions = useReactions(proposalId);
  const stops = useStopTimes(tripId);
  const locale = useLocale();
  const react = useCommand(reactProposalCommand);
  const [quick, setQuick] = useState(false);
  const version = versions.find((v) => v.recipientId === trip?.me) ?? null;
  const empty = version !== null && version.slides.length === 0 && version.status !== 'pending';

  useEffect(() => {
    if (empty) router.replace(proposalRoutes.open(proposalId));
  }, [empty, proposalId]);

  if (proposal == null || trip == null || version === null || version.slides.length === 0) {
    return (
      <ProposalLoading
        // No version to play counts too: the trailer is one person's slides.
        missing={proposal === null || trip === null || (trip != null && version === null)}
        fallback={proposalRoutes.open(proposalId)}
        testID="trailer-loading"
      />
    );
  }
  /** "Day 2 · 06:00" for a slide about a plan stop; the progress segments already say which slide. */
  const stopLine = (itemId: string | null): string | null => {
    const stop = itemId === null ? undefined : stops.get(itemId);
    return stop === undefined ? null : stopWhen(locale, stop) || null;
  };
  const names = new Map(trip.people.map((p) => [p.uid, p.name]));
  return (
    <Look
      guide={trip.guide}
      line={tripLine(locale, trip.destination, trip.startDate, trip.endDate)}
      held={storyHeld(quick)}
      slides={slidesInPlanOrder(version.slides, stops).map((slide, index) => ({
        id: `${index}`,
        label: `${slide.headline}. ${slide.body}`,
        eyebrow: stopLine(slide.item_id),
        headline: slide.headline,
        body: slide.body,
      }))}
      reactions={[...reactions].reverse().map((r) => ({
        id: `${r.userId}-${r.at}`,
        author: names.get(r.userId) ?? '',
        text: reactionWords(r.kind),
      }))}
      quick={quick ? QUICK.map((kind) => ({ kind, label: reactionWords(kind) })) : null}
      onToggleQuick={() => setQuick(replyPanelAfter(quick, 'toggle'))}
      onReact={(kind) => {
        setQuick(replyPanelAfter(quick, 'sent'));
        void react.send({ proposal_id: proposalId, reaction: kind });
      }}
      onIn={() => router.push(proposalRoutes.board(proposalId))}
      onVersion={() => router.replace(proposalRoutes.open(proposalId))}
    />
  );
}
