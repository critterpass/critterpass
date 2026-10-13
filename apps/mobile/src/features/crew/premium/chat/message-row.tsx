/**
 * One message in the premium crew chat (5.01–5.12): their bubble (white, avatar and name on the
 * first of a run, the 6 tail corner on the last), yours (ink, "Read by N" or its delivery state
 * under it), the guide's (Tokek tint, Borel name), a sticker without a bubble, or a card from the
 * premium card registry; reactions sit under it. Holding a row opens the long-press menu.
 */
import { t } from '@lingui/core/macro';
import { memo, useRef, type ReactNode, type ComponentRef } from 'react';
import { View } from 'react-native';

import { shortName } from '@/lib/people/member-name';
import {
  Avatar,
  CritterSticker,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { chatCard, renderCard } from '../../chat/cards/registry';
import { isStickerPose } from '../../chat/cards/sticker-caption';
import type { ChatMessage } from '../../chat/data/rows';
import type { ReactionGroup } from '../../chat/data/use-reactions';
import { CHAT_PAINT, ring } from '../premium-paint';
import { premiumCard } from './cards/registry';
import { DeliveryLine } from './delivery-line';
import { MessageText } from './message-text';
import { ReactionChips } from './reaction-chips';
import { STICKER_TILT_MINE, STICKER_TILT_THEIRS, StickerMessage } from './sticker-message';

export const AVATAR = 28;
const GROUP_MAX = 300;
const MINE_MAX = 270;
const TAIL = 6;

export interface MessageAnchor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MessageRowHandlers {
  readonly onLongPress: (message: ChatMessage, anchor: MessageAnchor) => void;
  readonly onRetry: (message: ChatMessage) => void;
  readonly onDiscard: (message: ChatMessage) => void;
  readonly onToggleReaction: (messageId: string, reaction: string) => void;
  readonly onShowReactions: (message: ChatMessage) => void;
}

export interface MessageRowProps {
  readonly message: ChatMessage;
  readonly mine: boolean;
  readonly first: boolean;
  readonly last: boolean;
  readonly senderName: string;
  readonly senderColor: string;
  readonly guideName: string;
  readonly readBy: number;
  readonly animate: boolean;
  readonly readOnly: boolean;
  readonly repliedTo: ChatMessage | undefined;
  readonly repliedToColor: string | undefined;
  readonly reactions: readonly ReactionGroup[];
  readonly handlers: MessageRowHandlers;
}

const useStyles = makePremiumStyles((th) => ({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: th.space.gap8 },
  mineRow: { alignItems: 'flex-end' },
  avatarSlot: { width: AVATAR },
  name: { paddingStart: AVATAR + th.space.gap8, marginBottom: 3 },
  column: { flexShrink: 1, maxWidth: GROUP_MAX, gap: th.space.gap4 },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: th.color.card,
    borderRadius: th.radius.banner,
    paddingVertical: 9,
    paddingHorizontal: 13,
    boxShadow: ring(0.5, th.color.hairline),
  },
  mine: {
    alignSelf: 'flex-end',
    maxWidth: MINE_MAX,
    backgroundColor: th.color.inkSurface,
    borderRadius: th.radius.banner,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  guide: {
    alignSelf: 'flex-start',
    width: 282,
    maxWidth: '100%',
    backgroundColor: th.color.banner.guide.bg,
    borderRadius: th.radius.card,
    paddingVertical: th.space.gap12,
    paddingHorizontal: th.space.gap14,
    gap: th.space.gap4,
  },
  failed: {
    backgroundColor: th.color.card,
    boxShadow: ring(1.5, th.color.destructive.fieldRing),
  },
  waiting: { opacity: 0.55 },
  guideAvatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: th.color.status.maybe.bg,
  },
}));

function tail(mine: boolean, last: boolean) {
  if (!last) return null;
  return mine ? { borderBottomRightRadius: TAIL } : { borderBottomLeftRadius: TAIL };
}

export const PremiumMessageRow = memo(function PremiumMessageRow(props: MessageRowProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const { message, mine, first, last, handlers } = props;
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const guide = message.senderKind === 'guide';

  const openMenu = () => {
    if (props.readOnly || message.deleted) return;
    anchor.current?.measureInWindow((x, y, width, height) =>
      handlers.onLongPress(message, { x, y, width, height }),
    );
  };

  let body: ReactNode;
  if (message.type === 'sticker' && message.refId !== null && isStickerPose(message.body)) {
    body = (
      <StickerMessage
        formId={message.refId}
        pose={message.body}
        size={112}
        tilt={mine ? STICKER_TILT_MINE : STICKER_TILT_THEIRS}
        animate={props.animate}
      />
    );
  } else if (message.type !== 'text' && message.type !== 'system') {
    const card = premiumCard(message.type);
    // A kind with no premium card yet draws its current one; a kind this build does not know
    // draws the "needs a newer CritterPass" card.
    body =
      card !== undefined
        ? card.render(message, mine)
        : chatCard(message.type) !== undefined
          ? renderCard(message, mine)
          : premiumCard('unknown')?.render(message, mine);
  } else if (guide) {
    body = (
      <View style={[styles.guide, tail(false, last)]}>
        <Text variant="guideName" tone="guideName">
          {props.guideName}
        </Text>
        <MessageText body={message.body} tone="guide" deleted={message.deleted} />
      </View>
    );
  } else {
    body = (
      <View
        style={[
          mine ? styles.mine : styles.theirs,
          tail(mine, last),
          message.status === 'failed' ? styles.failed : null,
        ]}
      >
        {props.repliedTo === undefined ? null : (
          <ReplyQuote
            message={props.repliedTo}
            color={props.repliedToColor ?? th.accent.sun}
            onInk={mine && message.status !== 'failed'}
          />
        )}
        <MessageText
          body={message.body}
          tone={mine && message.status !== 'failed' ? 'mine' : 'theirs'}
          deleted={message.deleted}
          edited={message.edited}
        />
      </View>
    );
  }

  const avatar = guide ? (
    <View style={styles.guideAvatar}>
      <CritterSticker kind="gecko" name={props.guideName} size={AVATAR} edge={false} />
    </View>
  ) : (
    <Avatar name={props.senderName} color={props.senderColor} size={AVATAR} ringed />
  );

  return (
    <View
      style={message.status === 'sending' ? styles.waiting : null}
      testID={`chat-row-${message.id}`}
    >
      {!mine && first && !guide ? (
        <Text variant="badge" tone="muted" style={styles.name}>
          {props.senderName}
        </Text>
      ) : null}
      <View style={[styles.row, mine ? { justifyContent: 'flex-end' } : null]}>
        {mine ? null : <View style={styles.avatarSlot}>{last ? avatar : null}</View>}
        <View style={[styles.column, mine ? { alignItems: 'flex-end' } : null]}>
          <PressableScale
            onLongPress={openMenu}
            pressedScale={1}
            // A card keeps its own buttons (play, vote, open) reachable by screen readers.
            {...(message.type === 'text' || message.type === 'system' ? {} : { accessible: false })}
            accessibilityHint={
              props.readOnly
                ? undefined
                : t({ id: 'chat.premium.row.hint', message: 'Hold to react, reply or pin' })
            }
          >
            <View ref={anchor} collapsable={false}>
              {body}
            </View>
          </PressableScale>
          <ReactionChips
            groups={props.reactions}
            readOnly={props.readOnly}
            onToggle={(reaction) => handlers.onToggleReaction(message.id, reaction)}
            onShowWho={() => handlers.onShowReactions(message)}
          />
          {mine && (last || message.status !== 'sent') ? (
            <DeliveryLine
              message={message}
              readBy={props.readBy}
              onRetry={() => handlers.onRetry(message)}
              onDiscard={() => handlers.onDiscard(message)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
});

function ReplyQuote({
  message,
  color,
  onInk,
}: {
  readonly message: ChatMessage;
  readonly color: string;
  readonly onInk: boolean;
}) {
  const th = usePremiumTheme();
  return (
    <View
      style={{
        borderLeftWidth: 3,
        borderLeftColor: color,
        paddingVertical: 2,
        paddingLeft: 8,
        marginBottom: 6,
      }}
    >
      <Text variant="captionMuted" color={color} style={{ fontWeight: '700' }} numberOfLines={1}>
        {shortName(message.senderName)}
      </Text>
      <Text
        variant="captionMuted"
        color={onInk ? CHAT_PAINT.onInkMeta : th.color.muted}
        numberOfLines={2}
      >
        {message.body}
      </Text>
    </View>
  );
}
