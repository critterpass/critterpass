/**
 * The poll card in crew chat (3g-1): the question and whose poll it is, one row per answer with a
 * fill bar that slides to its share of the crew (the denominator is everyone who can vote), the
 * voters' avatars and the count; tapping an answer votes (a "+1" pops beside it), tapping another
 * changes the vote while the poll allows it. A deadline chip while open; the result once closed.
 * A place the organiser locked in before anyone voted was never a vote: the card shows the place
 * with no bar and no count, and says who locked it in.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { GrowBar } from '@/ui/data/LinearBar';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useCastBallot } from '../data/use-cast-ballot';
import { useOrganiserName } from '../data/use-final';
import { stackOf, usePeople, type Person } from '../data/use-people';
import type { PollOptionView, PollView } from '../data/poll-view';
import { deadlineParts, upper } from '../format';

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
    gap: th.space['8'],
    minWidth: 260,
  },
  option: {
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.bg.control,
    overflow: 'hidden',
    minHeight: 40,
    justifyContent: 'center',
  },
  fill: { ...({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const) },
  optionRow: { paddingHorizontal: th.space['12'], paddingVertical: th.space['8'] },
  plusOne: { position: 'absolute', right: th.space['4'], top: -th.space['8'] },
}));

function PlusOne({ show }: { readonly show: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const lift = useSharedValue(0);
  const fade = useSharedValue(0);
  useEffect(() => {
    if (!show) return;
    lift.value = 0;
    fade.value = withSequence(
      withTiming(1, { duration: tokens.motion.duration.instant }),
      withTiming(0, { duration: tokens.motion.duration.medium }),
    );
    lift.value = withTiming(-tokens.space['16'], { duration: tokens.motion.duration.slow });
  }, [show, lift, fade]);
  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: lift.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.plusOne, style]}>
      <Text variant="label" color={theme.semantic.state.success}>
        +1
      </Text>
    </Animated.View>
  );
}

function OptionRow({
  option,
  index,
  eligible,
  people,
  onVote,
  plain = false,
}: {
  /** No bar and no count: the option was decided without a vote. */
  readonly plain?: boolean;
  readonly option: PollOptionView;
  readonly index: number;
  readonly eligible: number;
  readonly people: ReadonlyMap<string, Person>;
  readonly onVote: ((id: string) => void) | undefined;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const highlight = !plain && (option.mine || option.winner);
  const label = [
    option.label,
    plain ? null : t({ id: 'vote.poll.votes', message: `${option.votes} votes` }),
    option.mine ? t({ id: 'vote.poll.yours', message: 'your vote' }) : null,
    option.winner ? t({ id: 'vote.poll.winner', message: 'winner' }) : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <PressScale
      widthClass="wide"
      accessibilityLabel={label}
      accessibilityState={{ selected: option.mine, disabled: onVote === undefined }}
      {...(onVote === undefined ? {} : { onPress: () => onVote(option.id) })}
      style={styles.option}
      testID={`poll-option-${index}`}
    >
      {plain ? null : (
        <View style={styles.fill}>
          <GrowBar
            fraction={eligible > 0 ? option.votes / eligible : 0}
            color={highlight ? theme.semantic.state.success : theme.color.ink['600']}
            index={index}
          />
        </View>
      )}
      <Row justify="space-between" align="center" style={styles.optionRow}>
        <Text
          variant="label"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
          color={highlight ? theme.semantic.text.onAccent : undefined}
        >
          {option.label.toLocaleUpperCase()}
        </Text>
        {plain ? null : (
          <Row gap="6" align="center">
            {option.voterIds.length > 0 ? (
              <AvatarStack members={stackOf(people, option.voterIds)} size="sm" max={3} />
            ) : null}
            <Text variant="title" color={highlight ? theme.semantic.text.onAccent : undefined}>
              {String(option.votes)}
            </Text>
          </Row>
        )}
      </Row>
      <PlusOne show={option.mine} />
    </PressScale>
  );
}

export interface PollCardBodyProps {
  readonly poll: PollView;
  readonly askerName: string | null;
  readonly now?: Date;
}

/** The card for a loaded poll (the chat card and the poll screen share it). */
export function PollCardBody({ poll, askerName, now = new Date() }: PollCardBodyProps) {
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
  return (
    <Stack style={styles.card} testID={`poll-card-${poll.id}`}>
      <Row justify="space-between" align="baseline" gap="8" accessible accessibilityRole="header">
        <Text variant="title" style={{ flexShrink: 1 }}>
          {upper(title, i18n.locale)}
        </Text>
        {askerName === null ? null : (
          <Text variant="caption" numberOfLines={1}>
            {t({ id: 'vote.poll.byline', message: `${askerName}'s poll` })}
          </Text>
        )}
      </Row>
      {(lockedIn ? [winner] : poll.options).map((option, index) => (
        <OptionRow
          key={option.id}
          plain={lockedIn}
          option={option}
          index={index}
          eligible={poll.eligibleIds.length}
          people={people}
          onVote={canTap ? (id) => void cast(id) : undefined}
        />
      ))}
      {poll.status === 'closed' ? (
        <Text variant="caption" testID="poll-result-line">
          {winner === undefined
            ? t({ id: 'vote.poll.closedNoWinner', message: 'Closed. Nobody voted.' })
            : lockedIn
              ? lockedBy === null
                ? t({ id: 'vote.poll.lockedIn', message: 'Locked in, no vote needed.' })
                : t({ id: 'vote.poll.lockedInBy', message: `Locked in by ${lockedBy}.` })
              : t({ id: 'vote.poll.closedWinner', message: `Closed. ${winner.label} won.` })}
        </Text>
      ) : deadline === null || deadline.kind === 'past' ? null : (
        <Row>
          <InfoPill variant="outline" testID="poll-deadline">
            {deadline.kind === 'hours'
              ? t({ id: 'vote.poll.closesHours', message: `Closes in ${deadline.hours}h` })
              : t({ id: 'vote.poll.closesDay', message: `Closes ${deadline.day}` })}
          </InfoPill>
        </Row>
      )}
    </Stack>
  );
}
