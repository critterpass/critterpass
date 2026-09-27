import { t } from '@lingui/core/macro';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import { useLongPress } from '@/motion/gestures/long-press';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export type ChatMessageKind = 'theirs' | 'mine' | 'guide' | 'photo' | 'divider';

export interface ChatMessageAction {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface ChatMessageProps {
  readonly kind: ChatMessageKind;
  /** Message text; the divider's label ("Today"); the photo's caption. */
  readonly text: string;
  /** Sender's name, read before the message. Omit for `mine` and `divider`. */
  readonly author?: string;
  /** Sender avatar or guide sticker at the start edge. */
  readonly avatar?: ReactNode;
  /** Guide voice colour (guide messages). */
  readonly guideColor?: string;
  /** Photo content for `photo` messages. */
  readonly photo?: ReactNode;
  /** Inline call to action under a guide line ("I'm in · 1 slot left"). */
  readonly footer?: ReactNode;
  /** Long-press menu (react, reply, copy, report); also exposed as screen-reader actions. */
  readonly actions?: readonly ChatMessageAction[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  bubble: {
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
    maxWidth: '82%',
  },
  photo: { width: '62%', aspectRatio: 1.2, borderRadius: th.radius.lg, overflow: 'hidden' },
  avatarSlot: { width: th.size.avatar.lg, alignItems: 'center' },
  divider: { alignSelf: 'center', paddingVertical: th.space['8'] },
}));

function bubbleRadius(radii: readonly number[]) {
  const [topStart = 0, topEnd = 0, bottomEnd = 0, bottomStart = 0] = radii;
  return {
    borderTopStartRadius: topStart,
    borderTopEndRadius: topEnd,
    borderBottomEndRadius: bottomEnd,
    borderBottomStartRadius: bottomStart,
  };
}

/** One chat line: theirs (dark), mine (yellow), guide (voice line in a bubble), photo or date divider. */
export function ChatMessage({
  kind,
  text,
  author,
  avatar,
  guideColor,
  photo,
  footer,
  actions = [],
  testID,
}: ChatMessageProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuLabel = t({ id: 'common.chat.messageActions', message: 'Message actions' });
  const longPress = useLongPress({
    onLongPress: () => setMenuOpen(true),
    disabled: actions.length === 0,
    accessibilityLabel: menuLabel,
  });

  if (kind === 'divider') {
    return (
      <View testID={testID} style={styles.divider} accessible accessibilityRole="header">
        <Text variant="eyebrow">{text}</Text>
      </View>
    );
  }

  const mine = kind === 'mine';
  const spoken =
    mine || !author ? text : t({ id: 'common.chat.fromAuthor', message: `${author}: ${text}` });
  const onAction = (event: AccessibilityActionEvent) => {
    actions.find((action) => action.id === event.nativeEvent.actionName)?.onPress();
  };
  const body =
    kind === 'photo' ? (
      <View style={styles.photo}>{photo}</View>
    ) : (
      <Stack
        gap="10"
        style={[
          styles.bubble,
          bubbleRadius(mine ? theme.radius.chatBubble.mine : theme.radius.chatBubble.theirs),
          { backgroundColor: mine ? theme.semantic.action.primary : theme.semantic.bg.raised },
        ]}
      >
        <Text
          variant={kind === 'guide' ? 'voice' : 'body'}
          color={
            mine
              ? theme.semantic.text.onAccent
              : kind === 'guide'
                ? (guideColor ?? theme.guide.tokek)
                : undefined
          }
        >
          {text}
        </Text>
        {footer}
      </Stack>
    );

  return (
    <Stack gap="6" testID={testID}>
      <Row gap="8" align="flex-end" justify={mine ? 'flex-end' : 'flex-start'}>
        {mine ? null : <View style={styles.avatarSlot}>{avatar}</View>}
        <GestureDetector gesture={longPress.gesture}>
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={spoken}
            accessibilityActions={actions.map((action) => ({
              name: action.id,
              label: action.label,
            }))}
            onAccessibilityAction={onAction}
            style={
              kind === 'photo'
                ? { width: '100%' }
                : { flexShrink: 1, alignItems: mine ? 'flex-end' : 'flex-start' }
            }
          >
            {body}
          </View>
        </GestureDetector>
      </Row>
      {menuOpen ? (
        <Row gap="6" wrap justify={mine ? 'flex-end' : 'flex-start'}>
          {actions.map((action) => (
            <ActionPill
              key={action.id}
              label={action.label}
              onPress={() => {
                setMenuOpen(false);
                action.onPress();
              }}
            />
          ))}
          <ActionPill
            tone="outline"
            label={t({ id: 'common.chat.closeActions', message: 'Close' })}
            onPress={() => setMenuOpen(false)}
          />
        </Row>
      ) : null}
    </Stack>
  );
}
