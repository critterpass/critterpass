/**
 * The winner reveal (3c-2): the winner's colour takes the screen, its name stamps down while the
 * guide hops in front of the turning rays and confetti fires once; the tally card follows, the
 * losing guide takes it well, and the organiser gets "SET UP KYOTO" while everyone else learns who
 * has the setup. Opening it files `mark_reveal_seen`, so each person sees it once on any device.
 * Viewers who missed the vote or whose pick lost get their own line; reduced motion stills the rays,
 * drops the confetti and fades the finished screen in.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { heroAt, useDestinationsMedia } from '@/data/media/use-subject-media';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { AvatarStack } from '@/ui/people/AvatarStack';
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

function nameOf(option: PollOptionView, places: ReturnType<typeof usePlaces>): string {
  return (option.refId === null ? undefined : places.get(option.refId)?.name) ?? option.label;
}

export function WinnerRevealView({ poll, me }: { readonly poll: PollView; readonly me: string }) {
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
    if (fired.current) return;
    fired.current = true;
    void send({ poll_id: poll.id });
  }, [poll.id, send]);

  const media = useDestinationsMedia([...places.values()].flatMap((p) => (p.slug ? [p.slug] : [])));
  const winner = poll.options.find((option) => option.winner);
  const loser = poll.options.find((option) => !option.winner);
  if (winner === undefined) return null;
  const winnerPlace = winner.refId === null ? undefined : places.get(winner.refId);
  const winnerName = nameOf(winner, places);
  const loserName = loser === undefined ? null : nameOf(loser, places);
  const loserGuide =
    loser === undefined
      ? null
      : GUIDE_STICKERS[guideOr(loser.refId === null ? null : places.get(loser.refId)?.guide)];
  const colour = winnerPlace?.colour ?? theme.color.orange;
  const ink = theme.semantic.text.onAccent;
  const missed = poll.eligibleIds.includes(me) && poll.myOptionId === null;
  const lost = poll.myOptionId !== null && poll.myOptionId !== winner.id;
  const tie = poll.tieBreak;
  const score = t({ id: 'vote.reveal.wins', message: `Wins ${pollScore(poll)}` });
  const setUp = () => {
    if (poll.tripId === null) return;
    const href = voteRoutes.tripSetup(poll.tripId);
    if (href === undefined) router.back();
    else router.replace(href);
  };
  const rows = poll.options.map((option) => ({
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
      colour={colour}
      photo={winnerPlace?.slug === undefined ? null : heroAt(media.get(winnerPlace.slug) ?? [])}
      eyebrow={upper(t({ id: 'vote.reveal.header', message: 'Where next? · Final' }), i18n.locale)}
      voted={upper(
        t({
          id: 'vote.reveal.voted',
          message: `${poll.votedCount} of ${poll.eligibleIds.length} voted`,
        }),
        i18n.locale,
      )}
      guide={GUIDE_STICKERS[guideOr(winnerPlace?.guide)]}
      name={upper(winnerName, i18n.locale)}
      score={upper(score, i18n.locale)}
      tallySummary={[
        `${winnerName}. ${score}`,
        ...poll.options.map(
          (option) =>
            `${nameOf(option, places)}, ${t({ id: 'vote.showdown.votes', message: `${option.votes} votes` })}`,
        ),
      ].join('; ')}
      rows={rows}
      notes={
        tie === null && !missed && !lost ? undefined : (
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

/**
 * The reveal plays once: a reveal this user has already seen (a cold start restoring this screen,
 * or another device having shown it) leaves for where the user came from instead of replaying.
 */
export function WinnerRevealScreen({ pollId }: { readonly pollId: string }) {
  // The reveal (3c-2) ends the vote on its SET UP call to action; the design draws no back control.
  useNoBackByDesign();
  const me = useMyUid();
  const { poll } = usePoll(pollId, me);
  const seenBefore = useRevealSeenOnOpen(pollId, me);
  useEffect(() => {
    if (seenBefore !== true) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [seenBefore]);
  if (poll === null || me === null || poll.status !== 'closed' || seenBefore !== false) {
    return null;
  }
  return <WinnerRevealView poll={poll} me={me} />;
}
