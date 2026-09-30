/**
 * The guide thread as the sheet shows it: saved questions (with the asker's avatar) and answers in
 * the guide's voice with their plan cards and sources, then the answer streaming now, questions
 * waiting for the connection, and whatever the turn ended on. A streamed answer gives way to its
 * saved copy once that syncs down, so nothing shows twice.
 */
import type { ReactNode } from 'react';

import { Stack } from '@/ui';
import { ChatMessage } from '@/ui/chat/ChatMessage';
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
  readonly names: ReadonlyMap<string, { readonly name: string; readonly joinIndex: number }>;
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

function Question({
  text,
  author,
}: {
  readonly text: string;
  readonly author: { readonly name: string; readonly joinIndex: number } | undefined;
}) {
  return (
    <ChatMessage
      kind="theirs"
      text={text}
      {...(author === undefined
        ? {}
        : {
            avatar: <Avatar name={author.name} joinIndex={author.joinIndex} size="sm" decorative />,
          })}
    />
  );
}

export function GuideConversation(props: GuideConversationProps) {
  const { messages, live, color, names } = props;
  const showLive = live !== null && !liveSettled(live, messages);
  const liveQuestionSaved =
    live !== null &&
    messages.some((message) => message.role === 'user' && message.text === live.question);
  const empty = messages.length === 0 && live === null && props.waiting.length === 0;
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
      {messages.map((message) =>
        message.role === 'user' ? (
          <Question
            key={message.id}
            text={message.text}
            author={message.authorId === null ? undefined : names.get(message.authorId)}
          />
        ) : (
          <Stack key={message.id} gap="12">
            <GuideAnswer
              text={message.text}
              color={color}
              sources={message.sources}
              rating={message.rating}
              {...(props.onRate === undefined
                ? {}
                : { onRate: (verdict: 'up' | 'down') => props.onRate?.(message.id, verdict) })}
              testID={`guide-answer-${message.id}`}
            />
            {message.proposals.map((id) => (
              <Stack key={id}>{props.renderProposal(id)}</Stack>
            ))}
          </Stack>
        ),
      )}
      {showLive && live !== null ? (
        <Stack gap="12" testID="guide-live">
          {liveQuestionSaved ? null : <Question text={live.question} author={names.get('me')} />}
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
