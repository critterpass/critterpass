/**
 * New poll from the chat's "+" menu (3g-1): a question, two to six answers, an optional deadline
 * and whether minds may change. Posting queues `create_poll` (it works offline); the card appears
 * in the chat once the crew's poll syncs.
 */
import { generateUuidV7, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { Segmented } from '@/ui/inputs/Segmented';
import { TextField } from '@/ui/inputs/TextField';
import { Toggle } from '@/ui/inputs/Toggle';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { createPollCommand } from '../data/vote-commands';

export type PollDeadline = 'none' | 'hour' | 'day' | 'days';

const DEADLINE_MS: Readonly<Record<PollDeadline, number | null>> = {
  none: null,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 3 * 24 * 60 * 60 * 1000,
};

export interface PollDraft {
  readonly question: string;
  readonly options: readonly string[];
  readonly deadline: PollDeadline;
  readonly allowChange: boolean;
}

/** The draft's answers that count (trimmed, non-empty); null while the draft cannot be posted. */
export function postableOptions(draft: PollDraft): string[] | null {
  const options = draft.options
    .map((option) => option.trim())
    .filter((option) => option.length > 0);
  const distinct = new Set(options.map((option) => option.toLocaleLowerCase()));
  if (draft.question.trim().length === 0) return null;
  if (options.length < POLL_MIN_OPTIONS || distinct.size !== options.length) return null;
  return options;
}

const useStyles = makeStyles((th) => ({ body: { padding: th.space['16'], gap: th.space['16'] } }));

export function CreatePollSheet({
  crewId,
  now = () => new Date(),
}: {
  readonly crewId: string;
  readonly now?: () => Date;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const create = useCommand(createPollCommand);
  const [draft, setDraft] = useState<PollDraft>({
    question: '',
    options: ['', ''],
    deadline: 'day',
    allowChange: true,
  });
  const options = postableOptions(draft);
  const setOption = (index: number, text: string) =>
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) => (i === index ? text : option)),
    }));
  const post = async () => {
    if (options === null) return;
    const window = DEADLINE_MS[draft.deadline];
    await create.send({
      poll_id: generateUuidV7(),
      crew_id: crewId,
      kind: 'generic',
      question: draft.question.trim(),
      options: options.map((label) => ({ label, kind: 'text' as const })),
      allow_change: draft.allowChange,
      ...(window === null ? {} : { closes_at: new Date(now().getTime() + window).toISOString() }),
    });
    router.back();
  };
  return (
    <Sheet
      detents={['large']}
      accessibilityLabel={t({ id: 'vote.newPoll.title', message: 'New poll' })}
      testID="new-poll"
    >
      <SheetScrollView>
        <Stack style={styles.body}>
          <Text variant="h2" accessibilityRole="header">
            {t({ id: 'vote.newPoll.title', message: 'New poll' })}
          </Text>
          <TextField
            label={t({ id: 'vote.newPoll.question', message: 'Question' })}
            value={draft.question}
            onChangeText={(question) => setDraft((current) => ({ ...current, question }))}
            maxLength={140}
            autoFocus
            testID="new-poll-question"
          />
          {draft.options.map((option, index) => (
            <TextField
              key={index}
              label={t({ id: 'vote.newPoll.option', message: `Answer ${index + 1}` })}
              value={option}
              onChangeText={(text) => setOption(index, text)}
              maxLength={80}
              testID={`new-poll-option-${index}`}
            />
          ))}
          {draft.options.length < POLL_MAX_OPTIONS ? (
            <Row>
              <InlineAction
                kind="choice"
                label={t({ id: 'vote.newPoll.addOption', message: 'Add an answer' })}
                onPress={() =>
                  setDraft((current) => ({ ...current, options: [...current.options, ''] }))
                }
                testID="new-poll-add-option"
              />
            </Row>
          ) : null}
          <Segmented<PollDeadline>
            label={t({ id: 'vote.newPoll.deadline', message: 'Closes' })}
            value={draft.deadline}
            onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
            segments={[
              { value: 'none', label: t({ id: 'vote.newPoll.never', message: 'When all vote' }) },
              { value: 'hour', label: t({ id: 'vote.newPoll.hour', message: '1 hour' }) },
              { value: 'day', label: t({ id: 'vote.newPoll.day', message: '1 day' }) },
              {
                value: 'days',
                label: t({ id: 'vote.newPoll.threeDays', message: '3 days' }),
              },
            ]}
            testID="new-poll-deadline"
          />
          <Row justify="space-between" align="center">
            <Text variant="body">
              {t({ id: 'vote.newPoll.allowChange', message: 'People can change their vote' })}
            </Text>
            <Toggle
              value={draft.allowChange}
              onValueChange={(allowChange) => setDraft((current) => ({ ...current, allowChange }))}
              label={t({ id: 'vote.newPoll.allowChange', message: 'People can change their vote' })}
              testID="new-poll-allow-change"
            />
          </Row>
          <View>
            <PillButton
              label={t({ id: 'vote.newPoll.post', message: 'Post poll' })}
              onPress={() => void post()}
              disabled={options === null}
              loading={create.pending}
              testID="new-poll-post"
            />
          </View>
        </Stack>
      </SheetScrollView>
    </Sheet>
  );
}
