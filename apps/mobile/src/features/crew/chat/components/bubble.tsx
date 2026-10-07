/**
 * One timeline message: crewmates' bubbles on the left (dark, avatar and name on the first of a
 * run, the tail corner on the last), the member's own on the right (yellow), the guide's lines in
 * its voice and colour, system rows as a centred caption, and a tombstone for deleted messages.
 * Own sends show their delivery state (a clock while sending; RETRY and DELETE once refused).
 * The body of each message type comes from `renderBody`, so cards plug in without touching this.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { useWindowDimensions, View, type AccessibilityActionEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { useMemberFaces } from '@/features/you';
import { PrivateContent } from '@/features/help';
import { useLocale } from '@/lib/i18n/use-locale';
import { useLongPress } from '@/motion/gestures/long-press';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Avatar } from '@/ui/people/Avatar';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { renderCard } from '../cards/registry';
import { SystemCard } from '../cards/system-card';
import type { ChatMessage } from '../data/rows';
import { firstName } from '../data/use-typing';
import { timeOf } from './format';
import { tidyGuideText } from './guide-text';
import { useRise } from './rise';
import { useSwipeToReply } from './swipe-reply';
import { useFormats } from '@/lib/i18n/formats';

export interface BubbleProps {
  readonly message: ChatMessage;
  readonly mine: boolean;
  readonly first: boolean;
  readonly last: boolean;
  /** Crew join order of the sender (member colour); -1 when unknown. */
  readonly joinIndex: number;
  readonly guideColor?: string;
  /** The viewer's zone for the time; the device zone when absent. */
  readonly timeZone?: string;
  /** Rise into place (a message that arrived while the chat was open). */
  readonly animate?: boolean;
  /** The message body for non-text types (cards, photos, voice notes). */
  readonly renderBody?: (message: ChatMessage) => ReactNode;
  /** Opens the message's actions (long press, or the screen reader's "More actions"). */
  readonly onActions?: () => void;
  /** Starts a reply (swipe, or the screen reader's "Reply"). */
  readonly onReply?: () => void;
  /** Quote of the message this one replies to. */
  readonly quote?: ReactNode;
  readonly reactions?: ReactNode;
  readonly onRetry?: () => void;
  readonly onDiscard?: () => void;
}

/** A card's share of the screen, the same cap as a text bubble's. */
export const CARD_SHARE = 0.82;

const useStyles = makeStyles((th) => ({
  bubble: { paddingHorizontal: th.space['14'], paddingVertical: th.space['10'] },
  // The width cap sits on the column, whose parent is the full-width row: a percentage on the
  // bubble itself resolves against its content-sized wrappers and squeezes short words apart.
  column: { flexShrink: 1 },
  textColumn: { maxWidth: '82%' },
  // Cards get a slot of their own point width: inside the content-sized wrappers above, a card or
  // placeholder sized by percentages would otherwise collapse to an empty bubble.
  cardSlot: { maxWidth: '100%' },
  avatarSlot: { width: th.size.avatar.lg, alignItems: 'center' },
  system: {
    alignSelf: 'center',
    paddingVertical: th.space['6'],
    paddingHorizontal: th.space['24'],
  },
  meta: { gap: th.space['6'], alignItems: 'center', paddingTop: th.space['4'] },
  under: { alignItems: 'flex-start' },
  pending: { width: th.space['6'], height: th.space['6'], borderRadius: th.space['6'] },
  underMine: { alignItems: 'flex-end' },
  underTheirs: { paddingStart: (th.size.avatar.lg ?? 0) + th.space['8'] },
}));

export function Bubble(props: BubbleProps) {
  const { message, mine, first, last, joinIndex, guideColor, animate = false } = props;
  const faces = useMemberFaces();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  useFormats();
  const rise = useRise(animate);
  const cardWidth = Math.round(useWindowDimensions().width * CARD_SHARE);

  const swipe = useSwipeToReply(
    () => props.onReply?.(),
    props.onReply !== undefined && !message.deleted,
  );
  const longPress = useLongPress({
    onLongPress: () => props.onActions?.(),
    disabled: props.onActions === undefined,
    accessibilityLabel: t({ id: 'chat.message.actions', message: 'Message actions' }),
  });

  if (message.senderKind === 'system' && message.type === 'system') {
    return (
      <Animated.View style={rise}>
        <SystemCard message={message} />
      </Animated.View>
    );
  }

  const guide = message.senderKind === 'guide';
  const author = mine ? null : guide ? (message.senderName ?? null) : firstName(message.senderName);
  const time = timeOf(message.createdAt, locale, props.timeZone);
  const radii = mine ? theme.radius.chatBubble.mine : theme.radius.chatBubble.theirs;
  const [topStart = 0, topEnd = 0, bottomEnd = 0, bottomStart = 0] = radii;
  const tail = last
    ? {}
    : mine
      ? { borderBottomEndRadius: topEnd }
      : { borderBottomStartRadius: topStart };
  const deleted = message.deleted;
  const text = deleted
    ? t({ id: 'chat.message.deleted', message: 'Message deleted' })
    : guide
      ? tidyGuideText(message.body)
      : message.body;
  const who = author ?? t({ id: 'chat.message.you', message: 'You' });
  const spoken = t({ id: 'chat.message.spoken', message: `${who}, ${time}: ${text}` });
  const card = !deleted && message.type !== 'text';
  const custom = card
    ? (props.renderBody ?? ((m: ChatMessage) => renderCard(m, mine)))(message)
    : null;
  const a11yActions = [
    ...(props.onReply === undefined
      ? []
      : [{ name: 'reply', label: t({ id: 'chat.action.reply', message: 'Reply' }) }]),
    ...(props.onActions === undefined
      ? []
      : [
          {
            name: 'actions',
            label: t({ id: 'chat.message.moreActions', message: 'More actions' }),
          },
        ]),
  ];

  return (
    <Animated.View style={rise} testID={`chat-message-${message.id}`}>
      <Row gap="8" align="flex-end" justify={mine ? 'flex-end' : 'flex-start'}>
        {mine ? null : (
          <View style={styles.avatarSlot}>
            {last && !guide ? (
              <Avatar
                name={author ?? '?'}
                joinIndex={Math.max(0, joinIndex)}
                size="sm"
                decorative
                {...(message.senderId === null ? {} : faces.faceProps(message.senderId, 'sm'))}
              />
            ) : null}
          </View>
        )}
        <Stack
          gap="4"
          style={[
            styles.column,
            custom === null ? styles.textColumn : null,
            { alignItems: mine ? 'flex-end' : 'flex-start' },
          ]}
        >
          {first && author !== null ? (
            <Text variant="label" color={guide ? guideColor : theme.semantic.text.secondary}>
              {guide
                ? t({ id: 'chat.message.guideAuthor', message: `${author} · AI guide` })
                : author}
            </Text>
          ) : null}
          <GestureDetector gesture={swipe.gesture}>
            <Animated.View style={swipe.style}>
              <GestureDetector gesture={longPress.gesture}>
                <View
                  {...(custom === null
                    ? {
                        // A text bubble reads as one line: who, when and what, with its actions.
                        accessible: true,
                        accessibilityLabel: spoken,
                        accessibilityActions: a11yActions,
                        onAccessibilityAction: (event: AccessibilityActionEvent) => {
                          if (event.nativeEvent.actionName === 'reply') props.onReply?.();
                          if (event.nativeEvent.actionName === 'actions') props.onActions?.();
                        },
                      }
                    : {
                        // A card keeps its own controls (play, VIEW, vote) reachable: grouping it
                        // into one element would hide them from VoiceOver and TalkBack.
                        style: [styles.cardSlot, { width: cardWidth }],
                        testID: `chat-card-slot-${message.id}`,
                      })}
                >
                  <PrivateContent>
                    {custom ?? (
                      <Stack
                        gap="6"
                        style={[
                          styles.bubble,
                          {
                            borderTopStartRadius: topStart,
                            borderTopEndRadius: topEnd,
                            borderBottomEndRadius: bottomEnd,
                            borderBottomStartRadius: bottomStart,
                            ...tail,
                            backgroundColor:
                              mine && !deleted
                                ? theme.semantic.action.primary
                                : theme.semantic.bg.raised,
                          },
                        ]}
                      >
                        {props.quote}
                        <Text
                          variant={guide && !deleted ? 'voice' : 'body'}
                          color={
                            deleted
                              ? theme.semantic.text.tertiary
                              : mine
                                ? theme.semantic.text.onAccent
                                : guide
                                  ? guideColor
                                  : undefined
                          }
                        >
                          {text}
                        </Text>
                      </Stack>
                    )}
                  </PrivateContent>
                </View>
              </GestureDetector>
            </Animated.View>
          </GestureDetector>
        </Stack>
      </Row>
      {/* Under the bubble, not beside the avatar: the avatar lines up with the bubble's foot. */}
      <View style={[styles.under, mine ? styles.underMine : styles.underTheirs]}>
        {props.reactions}
        <DeliveryLine {...props} />
      </View>
    </Animated.View>
  );
}

function DeliveryLine({ message, mine, onRetry, onDiscard }: BubbleProps) {
  const styles = useStyles();
  const theme = useTheme();
  const edited = message.edited && !message.deleted;
  if (message.status === 'failed') {
    return (
      <Row style={styles.meta} testID={`chat-failed-${message.id}`}>
        <Text variant="caption" color={theme.semantic.state.urgent}>
          {t({ id: 'chat.status.failed', message: 'Didn’t send' })}
        </Text>
        {onRetry ? (
          <InlineAction
            label={t({ id: 'chat.status.retry', message: 'Retry' })}
            onPress={onRetry}
          />
        ) : null}
        {onDiscard ? (
          <InlineAction
            label={t({ id: 'chat.status.delete', message: 'Delete' })}
            onPress={onDiscard}
          />
        ) : null}
      </Row>
    );
  }
  // 3g-1 shows no per-message times (the day divider carries the date, the time is in each
  // bubble's spoken label); only the delivery state and edits are written under a bubble.
  const sending = mine && message.status !== 'sent';
  if (!sending && !edited) return null;
  const parts = [
    ...(edited ? [t({ id: 'chat.status.edited', message: 'edited' })] : []),
    ...(sending ? [t({ id: 'chat.status.sending', message: 'Sending' })] : []),
  ];
  return (
    <Row style={styles.meta}>
      {sending ? (
        <View style={[styles.pending, { backgroundColor: theme.semantic.state.warning }]} />
      ) : null}
      <Text variant="caption" color={theme.semantic.text.tertiary}>
        {parts.join(' · ')}
      </Text>
    </Row>
  );
}
