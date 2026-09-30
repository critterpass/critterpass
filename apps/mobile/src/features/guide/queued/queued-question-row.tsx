/**
 * The question waiting for midnight, under the 4b-1 card: "WAITING FOR 00:00", the question as
 * asked, that the guide answers it then with a quiet notification, and CANCEL. A second ask the
 * same day, or one the connection could not carry, says so in one line.
 */
import { useLingui } from '@lingui/react/macro';

import { upper } from '@cp/i18n';

import { Row, Stack, Text, useTheme } from '@/ui';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';

import { resetClock } from '../meter/meter-model';
import type { QueuedQuestion, QueueProblem } from './use-queued-question';

export function QueuedQuestionRow({
  question,
  guideName,
  onCancel,
}: {
  readonly question: QueuedQuestion;
  readonly guideName: string;
  readonly onCancel: () => void;
}) {
  const { t, i18n } = useLingui();
  const theme = useTheme();
  const clock = resetClock(question.answerAfter, i18n.locale);
  return (
    <Card tone="sunken" testID="guide-queued">
      <Stack gap="8">
        <Row justify="space-between" align="center">
          <Text variant="eyebrow">
            {upper(t({ id: 'guide.queued.waiting', message: `Waiting for ${clock}` }), i18n.locale)}
          </Text>
          <TextLink
            label={t({ id: 'guide.queued.cancelAction', message: 'Cancel' })}
            onPress={onCancel}
            testID="guide-queued-cancel"
          />
        </Row>
        <Text variant="body">{`“${question.text}”`}</Text>
        <Text variant="bodySm" color={theme.semantic.text.secondary}>
          {t({
            id: 'guide.queued.body',
            message: `${guideName} answers this at ${clock} and lets you know quietly. It counts towards tomorrow.`,
          })}
        </Text>
      </Stack>
    </Card>
  );
}

export function QueueProblemLine({ problem }: { readonly problem: QueueProblem }) {
  const { t } = useLingui();
  const theme = useTheme();
  if (problem === null) return null;
  const line =
    problem === 'already_queued'
      ? t({
          id: 'guide.queued.already',
          message: 'You already have a question waiting for midnight.',
        })
      : problem === 'offline'
        ? t({
            id: 'guide.queued.offline',
            message: "That needs a connection. Try again when you're back online.",
          })
        : t({ id: 'guide.queued.refused', message: "That question couldn't be saved for later." });
  return (
    <Text variant="bodySm" color={theme.semantic.state.urgent} testID="guide-queue-problem">
      {line}
    </Text>
  );
}
