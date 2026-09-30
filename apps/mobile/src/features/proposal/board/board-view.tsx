/**
 * SLIDE TO BOARD (3f-5) as a pure view: "{PLACE} · {DATES}" with the crew already in and the
 * counter, the boarding pass, and the slider (its screen-reader action boards the same way). On
 * boarding the pass thumps, the guide's egg drops in under it and the counter flips; reduced
 * motion keeps the pass still and only the success haptic plays. Below the slider: MAYBE and "I can't make it".
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { TextLink } from '@/ui/buttons/TextLink';
import { Egg } from '@/ui/critters/Egg';
import { SplitFlap } from '@/ui/data/SplitFlap';
import { Ticket } from '@/ui/documents/Ticket';
import { SlideToConfirm } from '@/ui/inputs/SlideToConfirm';
import { AvatarStack, type StackMember } from '@/ui/people/AvatarStack';
import type { GuideStickerId as GuideId } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    minHeight: th.space['32'] + th.space['12'],
  },
  grow: { flex: 1 },
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['16'],
    paddingBottom: th.space['16'],
  },
  egg: { alignItems: 'center', gap: th.space['6'] },
  footer: { paddingHorizontal: th.space['20'], gap: th.space['8'], paddingBottom: th.space['8'] },
  links: { flexDirection: 'row', justifyContent: 'space-around' },
}));

export interface BoardViewProps {
  readonly guide: GuideId;
  readonly eyebrow: string;
  readonly name: string;
  readonly crewIn: readonly StackMember[];
  readonly counter: string;
  readonly boarded: boolean;
  readonly pending: boolean;
  readonly ticket: {
    readonly from: string;
    readonly to: string;
    readonly passenger: string;
    readonly dates: string;
    readonly share: string | null;
    readonly group: string;
    readonly seat: string;
  };
  readonly onBoard: () => void;
  readonly onMaybe: () => void;
  readonly onOut: () => void;
  readonly onDone: () => void;
}

export function BoardView(props: BoardViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const info = GUIDE_STICKERS[props.guide];
  const thump = useSharedValue(1);
  useEffect(() => {
    if (!props.boarded || reduced) return;
    thump.value = withSequence(
      withTiming(0.96, { duration: tokens.motion.duration.instant }),
      withSpring(1),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [props.boarded, reduced]);
  const passStyle = useAnimatedStyle(() => ({ transform: [{ scale: thump.value }] }));
  const ticket = props.ticket;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-board">
      <View style={styles.header}>
        <View style={styles.grow}>
          <Text variant="eyebrow">{props.eyebrow}</Text>
        </View>
        <AvatarStack members={props.crewIn} size="sm" />
        <SplitFlap value={props.counter} variant="title" testID="board-counter" />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h1" accessibilityRole="header" testID="board-title">
          {props.boarded
            ? t({ id: 'proposal.board.saved', message: `Your seat’s saved, ${props.name}` })
            : t({ id: 'proposal.board.waiting', message: `Your seat’s waiting, ${props.name}` })}
        </Text>
        <Animated.View style={passStyle}>
          <Ticket
            kind="crew"
            headStart={t({ id: 'proposal.board.airline', message: 'CritterPass Air' })}
            headEnd={t({ id: 'proposal.board.gate', message: 'Gate: yes' })}
            from={{ code: ticket.from }}
            to={{ code: ticket.to }}
            fields={[
              {
                key: 'passenger',
                label: t({ id: 'proposal.board.passenger', message: 'Passenger' }),
                value: ticket.passenger,
              },
              {
                key: 'dates',
                label: t({ id: 'proposal.board.dates', message: 'Dates' }),
                value: ticket.dates,
              },
              ...(ticket.share === null
                ? []
                : [
                    {
                      key: 'share',
                      label: t({ id: 'proposal.board.share', message: 'Your share' }),
                      value: ticket.share,
                    },
                  ]),
            ]}
            sticker={<Sticker kind={info.kind} name={info.name} size={56} />}
            stubText={t({
              id: 'proposal.board.group',
              message: `Boarding group: ${ticket.group}`,
            })}
            stubEnd={ticket.seat}
            accessibilityLabel={t({
              id: 'proposal.board.ticketA11y',
              message: `Boarding pass for ${ticket.passenger} to ${ticket.to}, ${ticket.dates}`,
            })}
            testID="board-ticket"
          />
        </Animated.View>
        {props.boarded ? (
          <Animated.View
            style={styles.egg}
            {...(reduced ? {} : { entering: FadeInDown.delay(500).springify() })}
            testID="board-egg"
          >
            <Egg state="wobbling" color={theme.guide[props.guide]} size={64} />
            <Text variant="label" color={theme.semantic.action.primary}>
              {t({
                id: 'proposal.board.egg',
                message: `${info.name}’s egg hatches when you land`,
              })}
            </Text>
            {props.pending ? (
              <Text variant="caption" color={theme.semantic.text.secondary} testID="board-pending">
                {t({
                  id: 'proposal.board.pending',
                  message: 'Waiting for a connection to save your seat.',
                })}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {props.boarded ? (
          <TextLink
            label={t({ id: 'proposal.board.done', message: 'Back to the proposal' })}
            onPress={props.onDone}
            testID="board-done"
          />
        ) : (
          <>
            <SlideToConfirm
              label={t({ id: 'proposal.board.slide', message: 'Slide to board' })}
              actionLabel={t({ id: 'proposal.board.action', message: 'Board' })}
              onConfirm={props.onBoard}
              knob={
                <View testID="board-knob">
                  <Sticker kind={info.kind} name={info.name} size={44} />
                </View>
              }
              testID="board-slide"
            />
            <View style={styles.links}>
              <TextLink
                label={t({ id: 'proposal.board.maybe', message: 'Maybe' })}
                onPress={props.onMaybe}
                testID="board-maybe"
              />
              <TextLink
                label={t({ id: 'proposal.board.out', message: 'I can’t make it' })}
                onPress={props.onOut}
                testID="board-out"
              />
            </View>
          </>
        )}
      </View>
    </Scaffold>
  );
}
