/**
 * The guide sheet's states around the answers: a new thread's greeting with three questions to
 * start from, the line a failed turn ends on (with RETRY when asking again can work), questions
 * waiting for the connection, and the Help card the guide raises for a safety question.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes and design ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { hrefFor } from '@/lib/navigation/screen-registry';
import { Row, Stack, Text } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { QuickActionChip } from '@/ui/chips/QuickActionChip';

import type { WaitingQuestion } from '../data/guide-question-queue';
import { TURN_STOPPED } from '../data/turn-state';
import { QuestionBubble } from './question-bubble';

export function EmptyThread({
  guideName,
  color,
  hasTrip,
  onPrompt,
}: {
  readonly guideName: string;
  readonly color: string;
  readonly hasTrip: boolean;
  readonly onPrompt: (text: string) => void;
}) {
  const { t } = useLingui();
  const prompts = hasTrip
    ? [
        t({ id: 'guide.empty.promptRain', message: 'What if it rains tomorrow?' }),
        t({ id: 'guide.empty.promptFood', message: 'Where should we eat tonight?' }),
        t({ id: 'guide.empty.promptSlow', message: 'Can we make day 2 slower?' }),
      ]
    : [
        t({ id: 'guide.empty.promptWhere', message: 'Where should we go next?' }),
        t({ id: 'guide.empty.promptWhen', message: 'Which month is best to go?' }),
        t({ id: 'guide.empty.promptCrew', message: 'How do I get my crew planning?' }),
      ];
  return (
    <Stack gap="12" testID="guide-empty">
      <Text variant="voice" color={color}>
        {hasTrip
          ? t({
              id: 'guide.empty.greeting',
              message: `Hi, I'm ${guideName}. Ask me anything about the trip, big or small.`,
            })
          : t({
              id: 'guide.empty.greetingNoTrip',
              message: `Hi, I'm ${guideName}. Ask me where to go, when, or how to get a trip started.`,
            })}
      </Text>
      <Row gap="8" wrap>
        {prompts.map((prompt, index) => (
          <QuickActionChip
            key={prompt}
            label={prompt}
            onPress={() => onPrompt(prompt)}
            testID={`guide-prompt-${index}`}
          />
        ))}
      </Row>
    </Stack>
  );
}

export function useFailureLine(code: string | null): string {
  const { t } = useLingui();
  switch (code) {
    case 'AI_REFUSED':
      return t({
        id: 'guide.error.refused',
        message: "That's not something I can help with. Ask me about the trip instead?",
      });
    case 'FAIR_USE_SLOWDOWN':
      return t({
        id: 'guide.error.busy',
        message: "I'm swamped right now. Give me a minute and ask again.",
      });
    case 'TOOL_UNAVAILABLE':
      return t({
        id: 'guide.error.cannotCheck',
        message: "I couldn't check that just now, so I won't guess.",
      });
    case TURN_STOPPED:
      return t({
        id: 'guide.error.stopped',
        message: 'Stopped there. Ask again whenever you like.',
      });
    case 'MODERATION_BLOCKED':
      return t({
        id: 'guide.error.moderation',
        message: "I can't answer that one. It didn't pass our safety check.",
      });
    case null:
    default:
      return t({
        id: 'guide.error.unavailable',
        message: 'I lost my train of thought. That one didn’t count.',
      });
  }
}

export function TurnFailure({
  code,
  retryable,
  color,
  onRetry,
}: {
  readonly code: string | null;
  readonly retryable: boolean;
  readonly color: string;
  readonly onRetry: () => void;
}) {
  const { t } = useLingui();
  const line = useFailureLine(code);
  return (
    <Stack gap="8" testID="guide-error">
      <Text variant="voice" color={color}>
        {line}
      </Text>
      {retryable ? (
        <Row>
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'guide.error.retry', message: 'Try again' })}
            onPress={onRetry}
            testID="guide-retry"
          />
        </Row>
      ) : null}
    </Stack>
  );
}

export function WaitingQuestions({
  questions,
  color,
}: {
  readonly questions: readonly WaitingQuestion[];
  readonly color: string;
}) {
  const { t } = useLingui();
  if (questions.length === 0) return null;
  return (
    <Stack gap="8" testID="guide-offline-queue">
      {questions.map((question) => (
        <QuestionBubble key={question.id} text={question.text} author={null} waiting />
      ))}
      <Text variant="voice" color={color}>
        {t({ id: 'guide.offline.line', message: "I'll answer when you're back online." })}
      </Text>
    </Stack>
  );
}

export function HelpCard() {
  const { t } = useLingui();
  const href = hrefFor('3k-6');
  return (
    <Card tone="pink" testID="guide-help-card">
      <Stack gap="8">
        <Text variant="title">
          {t({ id: 'guide.help.title', message: 'You don’t have to handle this alone' })}
        </Text>
        <Text variant="bodySm">
          {t({
            id: 'guide.help.body',
            message: 'Local emergency numbers and your crew are one tap away in Help.',
          })}
        </Text>
        {href === undefined ? null : (
          <Row>
            <PillButton
              size="sm"
              tone="ink"
              label={t({ id: 'guide.help.open', message: 'Open Help' })}
              onPress={() => router.push(href)}
            />
          </Row>
        )}
      </Stack>
    </Card>
  );
}
