/**
 * The winner reveal (3c-2): the winner's colour takes the screen, its name stamps down while the
 * guide hops in front of the turning rays and confetti fires once; the tally card follows, the
 * losing guide takes it well, and the organiser gets "SET UP KYOTO" while everyone else learns who
 * has the setup and gets "BACK HOME". Opening it files `mark_reveal_seen`, so each person sees it
 * play once on any device; opened again it is the finished result.
 * Viewers who missed the vote or whose pick lost get their own line; reduced motion stills the rays,
 * drops the confetti and fades the finished screen in. A place the organiser locked in before
 * anyone voted is not a vote that was won or missed: it shows as locked in, with no score.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { heroAt, useDestinationsMedia } from '@/data/media/use-subject-media';
import { guideSticker } from '@/ui/avatar/guides';
import { goBackOr } from '@/lib/navigation/back';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { useIsOrganiser, usePlaces } from '../data/use-board';
import { originCity, useOrganiserName, useRevealSeenOnOpen } from '../data/use-final';
import { useMyUid } from '../data/use-my-uid';
import { stackOf, usePeople } from '../data/use-people';
import { usePoll } from '../data/use-poll';
import type { PollOptionView, PollView } from '../data/poll-view';
import { markRevealSeenCommand } from '../data/vote-commands';
import { guideOr, money, upper } from '../format';
import { pollScore } from '../poll/poll-result';
import { voteRoutes } from '../routes';
import { RevealAction, RevealStage } from './reveal-stage';
import { REVEAL_MS } from './reveal-timeline';

function nameOf(option: PollOptionView, places: ReturnType<typeof usePlaces>): string {
  return (option.refId === null ? undefined : places.get(option.refId)?.name) ?? option.label;
}

export interface WinnerRevealViewProps {
  readonly poll: PollView;
  readonly me: string;
  /** A result opened again: the finished screen, with no stamp, thud or confetti. */
  readonly settled?: boolean | undefined;
}

export function WinnerRevealView({ poll, me, settled = false }: WinnerRevealViewProps) {
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const places = usePlaces(poll.id);
  const people = usePeople(poll.crewId);
  const organiser = useIsOrganiser(poll, me);
  const organiserName = useOrganiserName(poll);
  const seen = useCommand(markRevealSeenCommand);
  const fired = useRef(false);
  const send = seen.send;
  useEffect(() => {
    if (fired.current || settled) return;
    fired.current = true;
    void send({ poll_id: poll.id });
  }, [poll.id, send, settled]);

  const media = useDestinationsMedia([...places.values()].flatMap((p) => (p.slug ? [p.slug] : [])));
  const winner = poll.options.find((option) => option.winner);
  const loser = poll.options.find((option) => !option.winner);
  if (winner === undefined) return <RevealMissing />;
  const winnerPlace = winner.refId === null ? undefined : places.get(winner.refId);
  const winnerName = nameOf(winner, places);
  const loserName = loser === undefined ? null : nameOf(loser, places);
  const loserGuide =
    loser === undefined
      ? null
      : guideSticker(guideOr(loser.refId === null ? null : places.get(loser.refId)?.guide));
  const colour = winnerPlace?.colour ?? theme.color.orange;
  const ink = theme.semantic.text.onAccent;
  // Nobody voted: the organiser locked the place in, so there is no score and nothing to miss.
  const lockedIn = poll.votedCount === 0;
  const missed = !lockedIn && poll.eligibleIds.includes(me) && poll.myOptionId === null;
  const lost = poll.myOptionId !== null && poll.myOptionId !== winner.id;
  const tie = poll.tieBreak;
  const score = lockedIn
    ? t({ id: 'vote.reveal.lockedIn', message: 'Locked in' })
    : t({ id: 'vote.reveal.wins', message: `Wins ${pollScore(poll)}` });
  const lockedBy = organiser
    ? t({ id: 'vote.reveal.lockedByYou', message: 'You picked it' })
    : organiserName === null
      ? t({ id: 'vote.reveal.lockedByOrganiser', message: 'The organiser picked it' })
      : t({ id: 'vote.reveal.lockedBy', message: `${organiserName} picked it` });
  // The reveal draws no back control and takes no back gesture: its action is the only way out.
  const leave = () => goBackOr();
  const setUp = () => {
    const href = poll.tripId === null ? undefined : voteRoutes.tripSetup(poll.tripId);
    if (href === undefined) leave();
    else router.replace(href);
  };
  const rows = (lockedIn ? [] : poll.options).map((option) => ({
    id: option.id,
    name: upper(nameOf(option, places), i18n.locale),
    votes: option.votes,
    winner: option.winner,
    voters:
      option.voterIds.length > 0 ? (
        <AvatarStack members={stackOf(people, option.voterIds)} size="sm" max={8} />
      ) : undefined,
    color: option.winner
      ? colour
      : ((option.refId === null ? undefined : places.get(option.refId)?.colour) ??
        theme.color.ink['600']),
  }));
  return (
    <RevealStage
      holdAt={settled ? REVEAL_MS.end : undefined}
      colour={colour}
      photo={winnerPlace?.slug === undefined ? null : heroAt(media.get(winnerPlace.slug) ?? [])}
      eyebrow={upper(
        lockedIn
          ? t({ id: 'vote.reveal.headerLocked', message: 'Where next? · Decided' })
          : t({ id: 'vote.reveal.header', message: 'Where next? · Final' }),
        i18n.locale,
      )}
      voted={upper(
        lockedIn
          ? lockedBy
          : t({
              id: 'vote.reveal.voted',
              message: `${poll.votedCount} of ${poll.eligibleIds.length} voted`,
            }),
        i18n.locale,
      )}
      guide={guideSticker(guideOr(winnerPlace?.guide))}
      name={upper(winnerName, i18n.locale)}
      score={upper(score, i18n.locale)}
      tallySummary={[
        `${winnerName}. ${score}`,
        ...(lockedIn ? [] : poll.options).map((option) => {
          const votes = option.votes;
          const count = t({
            id: 'vote.showdown.count',
            message: plural(votes, { one: '# vote', other: '# votes' }),
          });
          return `${nameOf(option, places)}, ${count}`;
        }),
      ].join('; ')}
      rows={rows}
      notes={
        lockedIn ? (
          <Text variant="bodySm" testID="reveal-locked-in">
            {organiser
              ? t({
                  id: 'vote.reveal.lockedNoteYou',
                  message: `No vote needed: you locked ${winnerName} in. Next, the dates.`,
                })
              : t({
                  id: 'vote.reveal.lockedNote',
                  message: `No vote this time: ${winnerName} was locked in for the crew.`,
                })}
          </Text>
        ) : tie === null && !missed && !lost ? undefined : (
          <>
            {tie === null ? null : (
              <Text variant="bodySm" testID="reveal-tie">
                {t({
                  id: 'vote.reveal.tie',
                  message: `It was a tie. ${winnerName} won it: ${money(i18n.locale, tie.cheaperByMinor, tie.currency)} cheaper for the ${tie.memberCount} flying from ${originCity(tie.origin)}.`,
                })}
              </Text>
            )}
            {missed ? (
              <Text variant="bodySm" testID="reveal-missed">
                {t({
                  id: 'vote.reveal.missed',
                  message: `You missed this vote. The crew picked ${winnerName}.`,
                })}
              </Text>
            ) : null}
            {lost ? (
              <Text variant="bodySm" testID="reveal-lost">
                {t({
                  id: 'vote.reveal.lost',
                  message: `Your pick lost this time. ${winnerName} it is.`,
                })}
              </Text>
            ) : null}
          </>
        )
      }
      consolation={
        loserGuide === null
          ? null
          : {
              guide: loserGuide,
              line: t({
                id: 'vote.reveal.consolation',
                message: `${loserGuide.name} took it well. Already pitching the next trip.`,
              }),
            }
      }
      action={
        organiser ? (
          <RevealAction
            label={upper(
              t({ id: 'vote.reveal.setUp', message: `Set up ${winnerName}` }),
              i18n.locale,
            )}
            onPress={setUp}
          />
        ) : (
          <>
            <Text
              variant="body"
              color={ink}
              style={{ textAlign: 'center' }}
              testID="reveal-setup-with"
            >
              {organiserName === null
                ? t({
                    id: 'vote.reveal.setupWithOrganiser',
                    message: 'The organiser sets it up next.',
                  })
                : t({ id: 'vote.reveal.setupWith', message: `Setup is with ${organiserName}.` })}
            </Text>
            <RevealAction
              label={upper(t({ id: 'vote.reveal.backHome', message: 'Back home' }), i18n.locale)}
              onPress={leave}
              testID="reveal-back-home"
            />
          </>
        )
      }
      backInDeck={
        loserName === null
          ? null
          : t({
              id: 'vote.reveal.backInDeck',
              message: `${loserName} goes back in the deck for next time`,
            })
      }
    />
  );
}

/** A result that is not on this phone. */
function RevealMissing() {
  const { t } = useLingui();
  return (
    <ScreenMissing
      backLabel={t({ id: 'vote.reveal.back', message: 'Home' })}
      title={t({ id: 'vote.reveal.missingTitle', message: 'This result isn’t here' })}
      line={t({
        id: 'vote.reveal.missingLine',
        message: 'The vote may have been removed, or this phone hasn’t got it yet.',
      })}
      testID="reveal-missing"
    />
  );
}

/**
 * The reveal plays once: a reveal this user has already seen (a link from the trip or the inbox, a
 * cold start restoring this screen, another device having shown it) opens as the finished result
 * instead of replaying. While the poll is still being read, or its close has not reached this phone
 * yet, it waits under a back control; a poll that is not here says so.
 */
export function WinnerRevealScreen({ pollId }: { readonly pollId: string }) {
  // The reveal (3c-2) ends the vote on its call to action; the design draws no back control.
  useNoBackByDesign();
  const { t } = useLingui();
  const me = useMyUid();
  const { poll, loaded } = usePoll(pollId, me);
  const seenBefore = useRevealSeenOnOpen(pollId, me);
  if (poll !== null && me !== null && poll.status === 'closed' && seenBefore !== null) {
    return <WinnerRevealView poll={poll} me={me} settled={seenBefore} />;
  }
  if (loaded && me !== null && poll === null) return <RevealMissing />;
  return (
    <ScreenLoading
      backLabel={t({ id: 'vote.reveal.back', message: 'Home' })}
      label={t({ id: 'vote.reveal.loading', message: 'Loading the result' })}
      testID="reveal-loading"
    />
  );
}
