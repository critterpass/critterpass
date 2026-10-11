/**
 * The premium guide thread: saved questions and answers with their plan cards, then the turn
 * happening now (thinking dots, the working card once the guide runs tools, the answer as it
 * streams, a failed turn), questions waiting for signal, the offline tools card, and the meter's
 * footer. Saved messages are drawn once; only the live turn redraws as words arrive.
 */
import { t } from '@lingui/core/macro';
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';

import { Skeleton, TextButton, usePremiumTheme } from '@/ui/premium';

import { liveQuestionSaved, liveSettled } from '../chat/components/guide-conversation';
import type { WaitingQuestion } from '../chat/data/guide-question-queue';
import type { SavedGuideMessage } from '../chat/data/use-guide-thread';
import type { LiveTurn } from '../chat/data/use-guide-turn';
import { GuideAnswerRow, GuideQuestion } from './guide-bubbles';
import { WaitingQuestionRows } from './guide-offline';
import { FailedTurn, WorkingCard } from './guide-turn-cards';
import { TypingBubble } from './typing-bubble';

type Author = { readonly name: string; readonly color: string } | null;

export interface GuideThreadProps {
  readonly slug: string;
  readonly guideName: string;
  readonly loading: boolean;
  readonly messages: readonly SavedGuideMessage[];
  readonly onEarlier?: () => void;
  readonly authorOf: (authorId: string | null) => Author;
  readonly live: LiveTurn | null;
  readonly waiting: readonly WaitingQuestion[];
  readonly renderProposal: (changesetId: string) => ReactNode;
  readonly onRetry: () => void;
  readonly onRephrase: (question: string) => void;
  readonly onStop: () => void;
  /** "Ping me" on a slow answer; absent offline. */
  readonly ping?: { readonly asked: boolean; readonly busy: boolean; readonly onPress: () => void };
  /** Shown when the thread is empty (the starters). */
  readonly empty: ReactNode;
  /** Shown after the last line: the offline tools, the meter's footer. */
  readonly footer: ReactNode;
}

const Saved = memo(function Saved({
  message,
  author,
  slug,
  guideName,
  renderProposal,
}: {
  readonly message: SavedGuideMessage;
  readonly author: Author;
  readonly slug: string;
  readonly guideName: string;
  readonly renderProposal: (changesetId: string) => ReactNode;
}) {
  if (message.role === 'user') {
    return <GuideQuestion text={message.text} author={author} testID={`guide-q-${message.id}`} />;
  }
  return (
    <GuideAnswerRow
      slug={slug}
      guideName={guideName}
      text={message.text}
      testID={`guide-answer-${message.id}`}
    >
      {message.proposals.map((id) => (
        <View key={id}>{renderProposal(id)}</View>
      ))}
    </GuideAnswerRow>
  );
});

function LiveTurnRows(props: GuideThreadProps & { readonly live: LiveTurn }) {
  const { live, slug, guideName } = props;
  const state = live.state;
  const questionSaved = liveQuestionSaved(live, props.messages);
  const working = state.steps.length > 0 && state.phase === 'thinking';
  return (
    <View style={{ gap: 12 }} testID="guide-live">
      {questionSaved ? null : <GuideQuestion text={live.question} author={null} />}
      {working ? (
        <WorkingCard
          slug={slug}
          guideName={guideName}
          steps={state.steps}
          onStop={props.onStop}
          {...(props.ping === undefined ? {} : { ping: props.ping })}
        />
      ) : state.phase === 'thinking' ? (
        <TypingBubble slug={slug} guideName={guideName} />
      ) : null}
      {state.text === '' && state.proposals.length === 0 ? null : (
        <GuideAnswerRow
          slug={slug}
          guideName={guideName}
          text={state.text}
          testID="guide-answer-live"
        >
          {state.proposals.map((id) => (
            <View key={id}>{props.renderProposal(id)}</View>
          ))}
        </GuideAnswerRow>
      )}
      {state.phase === 'error' ? (
        <FailedTurn
          slug={slug}
          guideName={guideName}
          code={state.errorCode}
          retryable={state.retryable}
          onRetry={props.onRetry}
          onRephrase={() => props.onRephrase(live.question)}
        />
      ) : null}
    </View>
  );
}

export function GuideThread(props: GuideThreadProps) {
  const th = usePremiumTheme();
  const { messages, live } = props;
  if (props.loading) {
    return (
      <View style={{ gap: th.space.gap12 }} testID="guide-conversation-loading">
        <Skeleton height={44} radius={20} width="70%" />
        <Skeleton height={64} radius={20} />
        <Skeleton height={44} radius={20} width="60%" style={{ alignSelf: 'flex-end' }} />
      </View>
    );
  }
  const showLive = live !== null && !liveSettled(live, messages);
  const empty = messages.length === 0 && live === null && props.waiting.length === 0;
  return (
    <View style={{ gap: th.space.gap16 }} testID="guide-conversation">
      {empty ? props.empty : null}
      {props.onEarlier === undefined ? null : (
        <View style={{ alignItems: 'center' }}>
          <TextButton
            label={t({ id: 'guide.chat.earlier', message: 'Earlier messages' })}
            onPress={props.onEarlier}
            testID="guide-earlier"
          />
        </View>
      )}
      {messages.map((message) => (
        <Saved
          key={message.id}
          message={message}
          author={message.role === 'user' ? props.authorOf(message.authorId) : null}
          slug={props.slug}
          guideName={props.guideName}
          renderProposal={props.renderProposal}
        />
      ))}
      {showLive && live !== null ? <LiveTurnRows {...props} live={live} /> : null}
      <WaitingQuestionRows questions={props.waiting} />
      {props.footer}
    </View>
  );
}
