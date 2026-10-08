/**
 * The guide thread as the sheet shows it: saved questions (with the asker's avatar) and answers in
 * the guide's voice with their plan cards and sources, then the answer streaming now, questions
 * waiting for the connection, and whatever the turn ended on. A streamed answer gives way to its
 * saved copy once that syncs down, so nothing shows twice. Saved messages are drawn once: a token
 * arriving, or another message, redraws only the answer being written.
 */
import { useLingui } from '@lingui/react/macro';
import { memo, useCallback, type ReactNode } from 'react';

import { View } from 'react-native';

import { Row, Stack, Text, makeStyles } from '@/ui';
import { TextLink } from '@/ui/buttons/TextLink';
import { Avatar } from '@/ui/people/Avatar';

import type { SavedGuideMessage } from '../data/use-guide-thread';
import type { LiveTurn } from '../data/use-guide-turn';
import { GuideAnswer, GuideThinking } from './guide-answer';
import { EmptyThread, HelpCard, TurnFailure, WaitingQuestions } from './guide-states';

export interface GuideConversationProps {
  readonly guideName: string;
  readonly color: string;
  readonly hasTrip: boolean;
  readonly messages: readonly SavedGuideMessage[];
  /** Shows a page of earlier messages; absent when the thread is shown from its start. */
  readonly onEarlier?: () => void;
  readonly names: ReadonlyMap<string, { readonly name: string; readonly joinIndex: number }>;
  /** The asker's uid: their own questions sit on the right. */
  readonly me: string | null;
  readonly live: LiveTurn | null;
  readonly waiting: readonly string[];
  readonly renderProposal: (changesetId: string) => ReactNode;
  readonly onPrompt: (text: string) => void;
  readonly onRetry: () => void;
  readonly onRate?: (messageId: string, verdict: 'up' | 'down') => void;
  /** Shown after the last line (the 4b-1 trail-off and limit card). */
  readonly footer?: ReactNode;
}

/** Whether the live turn is already in the saved thread (its answer synced down). */
export function liveSettled(live: LiveTurn, messages: readonly SavedGuideMessage[]): boolean {
  if (live.state.phase !== 'done') return false;
  const text = live.state.text.trim();
  return messages.some((message) => message.role === 'guide' && message.text.trim() === text);
}

const useStyles = makeStyles((t) => ({
  row: { alignItems: 'flex-end', gap: t.space['8'] },
  mine: { justifyContent: 'flex-end' },
  bubble: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    paddingVertical: t.space['10'],
    flexShrink: 1,
  },
}));

/**
 * A question in the thread: the asker's own on the right, a crewmate's (GROUP) on the left with
 * their avatar.
 */
export function QuestionBubble({
  text,
  author,
}: {
  readonly text: string;
  /** Null for the asker's own question. */
  readonly author: { readonly name: string; readonly joinIndex: number } | null;
}) {
  const styles = useStyles();
  return (
    <Row style={[styles.row, author === null ? styles.mine : null]} testID="guide-question">
      {author === null ? null : (
        <Avatar name={author.name} joinIndex={author.joinIndex} size="sm" decorative />
      )}
      <View style={styles.bubble}>
        <Text variant="body">{text}</Text>
      </View>
    </Row>
  );
}

type Author = { readonly name: string; readonly joinIndex: number } | null;

/** One saved message. Its props keep their identity while the message is unchanged. */
const SavedMessage = memo(function SavedMessage({
  message,
  author,
  color,
  onRate,
  renderProposal,
}: {
  readonly message: SavedGuideMessage;
  /** Null for the asker's own question, and for answers. */
  readonly author: Author;
  readonly color: string;
  readonly onRate: GuideConversationProps['onRate'];
  readonly renderProposal: GuideConversationProps['renderProposal'];
}) {
  const id = message.id;
  const rate = useCallback((verdict: 'up' | 'down') => onRate?.(id, verdict), [onRate, id]);
  if (message.role === 'user') return <QuestionBubble text={message.text} author={author} />;
  return (
    <Stack gap="12">
      <GuideAnswer
        text={message.text}
        color={color}
        sources={message.sources}
        rating={message.rating}
        {...(onRate === undefined ? {} : { onRate: rate })}
        testID={`guide-answer-${id}`}
      />
      {message.proposals.map((proposal) => (
        <Stack key={proposal}>{renderProposal(proposal)}</Stack>
      ))}
    </Stack>
  );
});

export function GuideConversation(props: GuideConversationProps) {
  const { messages, live, color, names } = props;
  const { t } = useLingui();
  const showLive = live !== null && !liveSettled(live, messages);
  const liveQuestionSaved =
    live !== null &&
    messages.some((message) => message.role === 'user' && message.text === live.question);
  const empty =
    messages.length === 0 &&
    live === null &&
    props.waiting.length === 0 &&
    props.footer === undefined;
  return (
    <Stack gap="16" testID="guide-conversation">
      {empty ? (
        <EmptyThread
          guideName={props.guideName}
          color={color}
          hasTrip={props.hasTrip}
          onPrompt={props.onPrompt}
        />
      ) : null}
      {props.onEarlier === undefined ? null : (
        <Row>
          <TextLink
            label={t({ id: 'guide.chat.earlier', message: 'Earlier messages' })}
            onPress={props.onEarlier}
            testID="guide-earlier"
          />
        </Row>
      )}
      {messages.map((message) => (
        <SavedMessage
          key={message.id}
          message={message}
          author={
            message.role !== 'user' || message.authorId === null || message.authorId === props.me
              ? null
              : (names.get(message.authorId) ?? null)
          }
          color={color}
          onRate={props.onRate}
          renderProposal={props.renderProposal}
        />
      ))}
      {showLive && live !== null ? (
        <Stack gap="12" testID="guide-live">
          {liveQuestionSaved ? null : <QuestionBubble text={live.question} author={null} />}
          {live.state.phase === 'thinking' ? (
            <GuideThinking color={color} checking={live.state.checking > 0} />
          ) : null}
          {live.state.text === '' ? null : (
            <GuideAnswer
              text={live.state.text}
              color={color}
              streaming={live.state.phase === 'streaming'}
              sources={live.state.sources}
              testID="guide-answer-live"
            />
          )}
          {live.state.phase === 'streaming' && live.state.checking > 0 ? (
            <GuideThinking color={color} checking />
          ) : null}
          {live.state.helpCard ? <HelpCard /> : null}
          {live.state.proposals.map((id) => (
            <Stack key={id}>{props.renderProposal(id)}</Stack>
          ))}
          {live.state.phase === 'error' ? (
            <TurnFailure
              code={live.state.errorCode}
              retryable={live.state.retryable}
              color={color}
              onRetry={props.onRetry}
            />
          ) : null}
        </Stack>
      ) : null}
      <WaitingQuestions questions={props.waiting} color={color} />
      {props.footer}
    </Stack>
  );
}
