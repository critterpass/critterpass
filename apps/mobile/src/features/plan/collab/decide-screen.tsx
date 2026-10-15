/**
 * The live decision (3g-2) over the local database: votes, comments and +1s go out as queued
 * commands and show at once; who's here, what they're looking at and who's typing come over
 * `trip_presence`. Once the vote closes, an organiser puts the pick on the plan: a change set
 * option is applied, a place replaces the day's item that was up for the vote (through the plan
 * editor, so a member's pick would go to the crew as a change set).
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ComponentType } from 'react';

import { parsePlanAnchor } from '@cp/domain';
import { upper } from '@cp/i18n';

import { useCommand } from '@/data/commands/use-command';
import { impact } from '@/motion/feedback';
import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';

import { dayDate } from '../day/format';
import { useDayEditing } from '../day/use-day-editing';
import { buildDecision, type Anchor } from './decision-model';
import { type DecideViewProps } from './decide-props';
import {
  BALLOTS_SQL,
  BALLOTS_TABLES,
  OPTIONS_SQL,
  OPTIONS_TABLES,
  POLL_SQL,
  POLL_TABLES,
  type BallotRow,
  type OptionRow,
  type PollRow,
} from './queries';
import { useComments } from './use-comments';
import { optionAnchor, usePlanPresence } from './use-presence';
import { applyChangesetCommand, castDecisionBallotCommand } from '@/data/plan/commands';
import { useLiveRows } from '@/data/plan/live-rows';
import { dayItems } from '@/data/plan/plan-model';
import { addOp, removeOp } from '@/data/plan/plan-ops';
import { type PlanMember, useTripPlan } from '@/data/plan/use-trip-plan';

/** A thread drawn with its own composer. */
export interface DecideThreadProps {
  readonly tripId: string;
  readonly uid: string | null;
  readonly members: readonly PlanMember[];
  readonly guide: { readonly kind: string; readonly name: string };
  readonly title: string;
  readonly anchors: readonly Anchor[];
  readonly target: { readonly kind: 'option'; readonly id: string };
}

export interface DecideLook {
  readonly View: ComponentType<DecideViewProps>;
  readonly Thread: ComponentType<DecideThreadProps>;
}

export function DecideScreen({
  tripId,
  pollId,
  look,
}: {
  readonly tripId: string;
  readonly pollId: string;
  /** The look: its view, and a thread that brings its own composer. */
  readonly look: DecideLook;
}) {
  const { View, Thread } = look;
  const { t } = useLingui();
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const editor = useDayEditing(plan);
  const poll = useLiveRows<PollRow>(POLL_SQL, [pollId], POLL_TABLES);
  const options = useLiveRows<OptionRow>(OPTIONS_SQL, [pollId], OPTIONS_TABLES);
  const ballots = useLiveRows<BallotRow>(BALLOTS_SQL, [pollId], BALLOTS_TABLES);
  const comments = useComments(tripId, plan.uid);
  const vote = useCommand(castDecisionBallotCommand);
  const applySet = useCommand(applyChangesetCommand);
  const [focus, setFocus] = useState<string | null>(null);
  const [voteTokens, setVoteTokens] = useState<ReadonlyMap<string, number>>(new Map());
  const row = poll.rows[0] ?? null;
  const decision =
    row === null
      ? null
      : buildDecision({
          poll: row,
          options: options.rows,
          ballots: ballots.rows,
          queued: comments.queued,
          uid: plan.uid,
          now: comments.now,
        });

  // The day's item that is up for this vote (a place among the options, still marked voting).
  const optionPois = new Set(decision?.options.flatMap((o) => (o.poiId === null ? [] : [o.poiId])));
  const voting = plan.state.items.find(
    (item) => item.status === 'voting' && item.poi_id != null && optionPois.has(item.poi_id),
  );
  const day = plan.state.days.find((candidate) => candidate.day_no === voting?.day_no) ?? null;
  const presence = usePlanPresence(tripId, 'decide', day?.day_no ?? null);
  const nameOf = (uid: string) => plan.members.find((member) => member.uid === uid);
  const browsing = new Map<string, PlanMember[]>();
  for (const cursor of presence.cursors) {
    const anchor = parsePlanAnchor(cursor.anchor);
    const optionId = anchor?.kind === 'poll_option' ? anchor.id : null;
    const member = nameOf(cursor.uid);
    if (optionId === null || member === undefined) continue;
    browsing.set(optionId, [...(browsing.get(optionId) ?? []), member]);
  }

  const focused =
    decision?.options.find((option) => option.id === focus) ??
    decision?.options.find((option) => option.id === decision.leaderId) ??
    decision?.options[0] ??
    null;
  const anchors =
    focused === null
      ? []
      : [
          { kind: 'option' as const, id: focused.id },
          ...(focused.poiId === null
            ? []
            : [{ kind: 'poi_in_option' as const, id: `${focused.id}:${focused.poiId}` }]),
        ];

  const winner = decision?.options.find((option) => option.id === decision.winnerId) ?? null;
  const tz = plan.trip?.tz ?? 'UTC';
  const votingItem =
    voting === undefined || day === null
      ? null
      : (dayItems(plan.state, day.day_no, plan.display, tz).find(
          (item) => item.stableId === voting.stable_id,
        ) ?? null);
  const canPutOnPlan =
    plan.canApply &&
    winner !== null &&
    (winner.changesetId !== null ||
      (votingItem !== null && winner.poiId !== null && winner.poiId !== votingItem.poiId));
  const putOnPlan = () => {
    if (winner === null) return;
    impact('success');
    if (winner.changesetId !== null) {
      void applySet.send({ changeset_id: winner.changesetId, scope: 'group' });
      return;
    }
    if (
      votingItem === null ||
      day?.date == null ||
      votingItem.start === null ||
      votingItem.end === null
    )
      return;
    void editor.submit([
      removeOp(votingItem),
      addOp(
        { dayNo: day.day_no, date: day.date },
        {
          title: winner.title,
          poiId: winner.poiId,
          category: votingItem.category,
          start: votingItem.start,
          end: votingItem.end,
          tz: votingItem.tz,
        },
      ),
    ]);
  };

  const eyebrow = upper(
    day === null
      ? t({ id: 'plan.collab.eyebrowNoDay', message: 'Plan' })
      : day.date === null
        ? t({ id: 'plan.collab.eyebrowDay', message: `Day ${day.day_no}` })
        : t({
            id: 'plan.collab.eyebrow',
            message: `Day ${day.day_no} · ${dayDate(locale, day.date)}`,
          }),
    locale,
  );

  const shared = {
    eyebrow,
    here: presence.here.map((member) => member.name ?? '').filter((name) => name !== ''),
    decision,
    members: plan.members,
    browsing,
    voteTokens,
    onVote: (optionId: string) => {
      setFocus(optionId);
      presence.setCursor(optionAnchor(optionId));
      if (decision?.myVote === optionId) return;
      impact('vote');
      setVoteTokens((current) => new Map(current).set(optionId, (current.get(optionId) ?? 0) + 1));
      void vote.send({ poll_id: pollId, option_id: optionId });
    },
    onApply: canPutOnPlan ? putOnPlan : null,
  };

  return (
    <View
      {...shared}
      thread={
        focused === null ? null : (
          <Thread
            tripId={tripId}
            uid={plan.uid}
            members={plan.members}
            guide={guideSticker(plan.trip?.guide_slug)}
            title={focused.title}
            anchors={anchors}
            target={{ kind: 'option', id: focused.id }}
          />
        )
      }
      composer={null}
    />
  );
}
