/**
 * The chat composer: the shared input bar (+ attach, "Message, or @{guide}", mic that turns into
 * send once there is text) with @mention autocomplete above it, the reply being written shown as a
 * strip, typing notified on every keystroke, and send-side checks (length, unsafe links) before a
 * message is queued. A former member gets "You left this crew" in its place.
 */
import { t } from '@lingui/core/macro';
import { forwardRef, useImperativeHandle, useMemo, useState, type ReactNode } from 'react';

import { MESSAGE_BODY_MAX } from '@cp/domain';

import { Composer } from '@/ui/chat/Composer';
import { Row, Stack, Text, useTheme } from '@/ui';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { makeStyles } from '@/ui/theme';

import { draftProblem, type Draft } from '../data/use-send-message';
import {
  activeMentionQuery,
  completeMention,
  mentionMatches,
  MentionPicker,
  mentionsIn,
  type MentionCandidate,
} from './mention-picker';

export interface ChatComposerHandle {
  /** Puts `text` in the field (the empty chat's "Say hi"). */
  prefill(text: string): void;
}

export interface ChatComposerProps {
  readonly candidates: readonly MentionCandidate[];
  readonly guideName: string | null;
  readonly onSend: (draft: Draft) => void;
  readonly onTyping: () => void;
  readonly onAttach?: () => void;
  /** Reply being written: its preview strip, and how to cancel it. */
  readonly replyTo?: {
    readonly id: string;
    readonly preview: ReactNode;
    readonly onCancel: () => void;
  };
  readonly onMicTap?: () => void;
  readonly onHoldStart?: () => void;
  readonly onHoldEnd?: () => void;
  readonly recording?: boolean;
}

const useStyles = makeStyles((th) => ({
  wrap: { paddingHorizontal: th.space['12'], paddingTop: th.space['6'], gap: th.space['8'] },
  reply: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['6'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  former: { alignItems: 'center', padding: th.space['16'] },
}));

export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(
  function ChatComposer(props, ref) {
    const { candidates, guideName, onSend, onTyping, replyTo } = props;
    const styles = useStyles();
    const theme = useTheme();
    const [text, setText] = useState('');
    const [picked, setPicked] = useState<readonly MentionCandidate[]>([]);
    const [problem, setProblem] = useState<string | null>(null);
    useImperativeHandle(ref, () => ({ prefill: (value) => setText(value) }), []);

    const query = activeMentionQuery(text);
    const matches = useMemo(
      () => (query === null ? [] : mentionMatches(candidates, query)),
      [candidates, query],
    );

    const send = () => {
      const found = mentionsIn(text, picked);
      const draft: Draft = {
        body: text,
        mentions: found.mentions,
        mentions_guide: found.mentionsGuide,
        ...(replyTo === undefined ? {} : { reply_to: replyTo.id }),
        attachments: [],
      };
      const why = draftProblem(draft);
      if (why === 'too_long') {
        setProblem(
          t({
            id: 'chat.composer.tooLong',
            message: `Keep it under ${MESSAGE_BODY_MAX} characters.`,
          }),
        );
        return;
      }
      if (why === 'unsafe_link') {
        setProblem(
          t({ id: 'chat.composer.unsafeLink', message: 'Only http and https links can be sent.' }),
        );
        return;
      }
      if (why !== null) return;
      onSend(draft);
      setText('');
      setPicked([]);
      setProblem(null);
    };

    const placeholder =
      guideName === null
        ? t({ id: 'chat.composer.placeholder', message: 'Message' })
        : t({ id: 'chat.composer.placeholderGuide', message: `Message, or @${guideName}` });

    return (
      <Stack style={styles.wrap}>
        <MentionPicker
          matches={matches}
          onPick={(candidate) => {
            setText((current) => completeMention(current, candidate));
            setPicked((current) => [...current, candidate]);
          }}
        />
        {replyTo === undefined ? null : (
          <Row style={styles.reply} testID="chat-replying">
            {replyTo.preview}
            <InlineAction
              kind="ghost"
              label={t({ id: 'chat.composer.cancelReply', message: 'Cancel reply' })}
              onPress={replyTo.onCancel}
            />
          </Row>
        )}
        {problem === null ? null : (
          <Text
            variant="caption"
            color={theme.semantic.state.urgent}
            accessibilityLiveRegion="polite"
          >
            {problem}
          </Text>
        )}
        <Composer
          value={text}
          onChangeText={(value) => {
            setText(value);
            if (value.length > 0) onTyping();
          }}
          onSend={send}
          placeholder={placeholder}
          {...(props.onAttach === undefined ? {} : { onAttach: props.onAttach })}
          {...(props.onMicTap === undefined ? {} : { onMicTap: props.onMicTap })}
          {...(props.onHoldStart === undefined ? {} : { onHoldStart: props.onHoldStart })}
          {...(props.onHoldEnd === undefined ? {} : { onHoldEnd: props.onHoldEnd })}
          recording={props.recording ?? false}
          testID="chat-composer"
        />
      </Stack>
    );
  },
);

/** The composer's place for a former member who kept the chat: read-only. */
export function FormerMemberBar() {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.former} testID="chat-former">
      <Text variant="body" color={theme.semantic.text.secondary}>
        {t({ id: 'chat.former.line', message: 'You left this crew' })}
      </Text>
      <Text variant="caption" color={theme.semantic.text.tertiary}>
        {t({ id: 'chat.former.detail', message: 'You can still read the chat.' })}
      </Text>
    </Stack>
  );
}
