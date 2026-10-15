/**
 * The poll card in the premium crew chat (5.01): the question with whose poll it is and how many
 * of the crew have voted, one row per answer with a bar that slides to its share of the crew (the
 * denominator is everyone who can vote), the voters' faces and the count. Tapping an answer votes;
 * tapping another changes the vote while the poll allows it. A deadline line while open; the
 * result once closed. A place the organiser locked in before anyone voted was never a vote: the
 * card shows the place with no bar and no count, and says who locked it in.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { ChatCardProps } from '@/features/crew';
import {
  CrewStack,
  PressableScale,
  SPRINGS,
  Skeleton,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { useCastBallot } from '../../data/use-cast-ballot';
import { useOrganiserName } from '../../data/use-final';
import { useMyUid } from '../../data/use-my-uid';
import { usePeople, type Person } from '../../data/use-people';
import { usePoll } from '../../data/use-poll';
import type { PollOptionView, PollView } from '../../data/poll-view';
import { deadlineParts } from '../../format';
import { crewOf, namesLine } from '../components/crew';

const useStyles = makePremiumStyles((th) => ({
  card: {
    padding: 14,
    gap: 8,
    minWidth: 260,
    borderRadius: th.radius.cardRow,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  option: {
    minHeight: 40,
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: th.color.control,
  },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
}));

/** The bar behind an answer: slides to its share when a vote lands, at once under reduced motion. */
function ShareBar({ fraction, color }: { readonly fraction: number; readonly color: string }) {
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const [width, setWidth] = useState(0);
  const fill = useSharedValue(0);
  useEffect(() => {
    const to = width * fraction;
    fill.set(reduced ? to : withSpring(to, SPRINGS.smooth));
  }, [width, fraction, reduced, fill]);
  const bar = useAnimatedStyle(() => ({ width: fill.value }));
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color }, bar]} />
    </View>
  );
}

function OptionRow(props: {
  /** No bar and no count: the option was decided without a vote. */
  readonly plain: boolean;
  readonly option: PollOptionView;
  readonly index: number;
  readonly eligible: number;
  readonly people: ReadonlyMap<string, Person>;
  readonly onVote: ((id: string) => void) | undefined;
}) {
  const { option, plain, onVote } = props;
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const highlight = !plain && (option.mine || option.winner);
  const voters = crewOf(props.people, option.voterIds);
  const label = [
    option.label,
    plain ? null : t({ id: 'vote.poll.votes', message: `${option.votes} votes` }),
    option.mine ? t({ id: 'vote.poll.yours', message: 'your vote' }) : null,
    option.winner ? t({ id: 'vote.poll.winner', message: 'winner' }) : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: option.mine, disabled: onVote === undefined }}
      disabled={onVote === undefined}
      {...(onVote === undefined ? {} : { onPress: () => onVote(option.id) })}
      style={styles.option}
      testID={`poll-option-${props.index}`}
    >
      {plain ? null : (
        <ShareBar
          fraction={props.eligible > 0 ? option.votes / props.eligible : 0}
          color={highlight ? theme.accent.sun : theme.color.progressTodo}
        />
      )}
      <View style={styles.row}>
        <Text variant={highlight ? 'rowTitle' : 'rowText'} numberOfLines={1} style={{ flex: 1 }}>
          {option.label}
        </Text>
        {plain ? null : (
          <>
            {voters.length > 0 ? (
              <CrewStack
                members={voters}
                size={20}
                max={3}
                accessibilityLabel={namesLine(voters, t({ id: 'vote.final.and', message: 'and' }))}
              />
            ) : null}
            <Text variant="headline">{String(option.votes)}</Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}

/** The card for a loaded poll. */
export function PremiumPollCardBody({
  poll,
  askerName,
  now = new Date(),
}: {
  readonly poll: PollView;
  readonly askerName: string | null;
  readonly now?: Date;
}) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const people = usePeople(poll.crewId);
  const { cast } = useCastBallot(poll);
  const canTap = poll.canVote && (poll.myOptionId === null || poll.allowChange);
  const title = poll.question ?? t({ id: 'vote.poll.untitled', message: 'Where next?' });
  const deadline = poll.closesAt === null ? null : deadlineParts(i18n.locale, poll.closesAt, now);
  const winner = poll.options.find((option) => option.winner);
  // Closed with a winner nobody voted for: the organiser locked the place in.
  const lockedIn = poll.status === 'closed' && winner !== undefined && poll.votedCount === 0;
  const lockedBy = useOrganiserName(poll);
  const voted = poll.votedCount;
  const of = poll.eligibleIds.length;
  const tally = t({ id: 'vote.premium.poll.tally', message: `${voted} of ${of}` });
  return (
    <View style={styles.card} testID={`poll-card-${poll.id}`}>
      <View style={styles.head} accessible accessibilityRole="header">
        <Text variant="headline" style={{ flex: 1 }}>
          {title}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={1}>
          {askerName === null || lockedIn ? (lockedIn ? '' : tally) : `${askerName} · ${tally}`}
        </Text>
      </View>
      {(lockedIn ? [winner] : poll.options).map((option, index) => (
        <OptionRow
          key={option.id}
          plain={lockedIn}
          option={option}
          index={index}
          eligible={of}
          people={people}
          onVote={canTap ? (id) => void cast(id) : undefined}
        />
      ))}
      {poll.status === 'closed' ? (
        <Text variant="caption" tone="muted" testID="poll-result-line">
          {winner === undefined
            ? t({ id: 'vote.poll.closedNoWinner', message: 'Closed. Nobody voted.' })
            : lockedIn
              ? lockedBy === null
                ? t({ id: 'vote.poll.lockedIn', message: 'Locked in, no vote needed.' })
                : t({ id: 'vote.poll.lockedInBy', message: `Locked in by ${lockedBy}.` })
              : t({ id: 'vote.poll.closedWinner', message: `Closed. ${winner.label} won.` })}
        </Text>
      ) : deadline === null || deadline.kind === 'past' ? null : (
        <Text variant="caption" tone="muted" testID="poll-deadline">
          {deadline.kind === 'hours'
            ? t({ id: 'vote.poll.closesHours', message: `Closes in ${deadline.hours}h` })
            : t({ id: 'vote.poll.closesDay', message: `Closes ${deadline.day}` })}
        </Text>
      )}
    </View>
  );
}

/** The chat card for a `poll` message; a poll that has not synced yet holds its place. */
export function PremiumChatPollCard({ message }: Pick<ChatCardProps, 'message'>) {
  const { t } = useLingui();
  const me = useMyUid();
  const { poll } = usePoll(message.refId, me);
  if (poll === null) {
    return (
      <View
        accessible
        accessibilityLabel={t({ id: 'vote.poll.loading', message: 'Loading the poll' })}
      >
        <Skeleton height={150} radius={24} />
      </View>
    );
  }
  return <PremiumPollCardBody poll={poll} askerName={message.senderName} />;
}
