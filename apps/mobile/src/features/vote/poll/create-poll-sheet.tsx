/**
 * New poll from the chat's "+" menu (3g-1): a question, two to six answers, an optional deadline
 * and whether minds may change. Posting queues `create_poll` (it works offline); the card appears
 * in the chat once the crew's poll syncs.
 */
import { generateUuidV7, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { View } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
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
import { makeStyles, useTheme } from '@/ui/theme';

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

/** What still stops the draft from being posted, for the line over the button; null when ready. */
export function postBlocker(draft: PollDraft): 'question' | 'answers' | 'same' | null {
  if (draft.question.trim().length === 0) return 'question';
  const options = draft.options
    .map((option) => option.trim().toLocaleLowerCase())
    .filter((option) => option.length > 0);
  if (options.length < POLL_MIN_OPTIONS) return 'answers';
  return new Set(options).size === options.length ? null : 'same';
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, paddingVertical: th.space['16'], gap: th.space['16'] },
  // Outside the scroll, so the button stays above the keyboard while the fields scroll.
  footer: {
    paddingHorizontal: th.size.gutter,
    paddingTop: th.space['8'],
    paddingBottom: th.space['16'],
    gap: th.space['8'],
  },
  reason: { textAlign: 'center' },
}));

export function CreatePollSheet({
  crewId,
  now = () => new Date(),
}: {
  readonly crewId: string;
  readonly now?: () => Date;
}) {
  const styles = useStyles();
  const { t } = useLingui();
  const theme = useTheme();
  const create = useCommand(createPollCommand);
  const [draft, setDraft] = useState<PollDraft>({
    question: '',
    options: ['', ''],
    deadline: 'day',
    allowChange: true,
  });
  // The question is field 0, the answers follow. The footer rides on the keyboard and covers the
  // field under the one being typed in, so a field taking focus scrolls up until the one before it
  // tops the form: the next field always shows, and return moves on to it.
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const inputs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  const tops = useRef<number[]>([]);
  const reveal = (field: number) =>
    scroll.current?.scrollTo({ y: tops.current[Math.max(0, field - 1)] ?? 0, animated: true });
  const options = postableOptions(draft);
  const blocker = postBlocker(draft);
  const reason =
    blocker === 'question'
      ? t({ id: 'vote.newPoll.needsQuestion', message: 'Add a question to post.' })
      : blocker === 'answers'
        ? t({ id: 'vote.newPoll.needsAnswers', message: 'Add at least two answers.' })
        : blocker === 'same'
          ? t({ id: 'vote.newPoll.sameAnswers', message: 'Two answers are the same.' })
          : null;
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
    goBackOr();
  };
  return (
    <Sheet
      detents={['large']}
      accessibilityLabel={t({ id: 'vote.newPoll.title', message: 'New poll' })}
      testID="new-poll"
    >
      <SheetScrollView ref={scroll} keyboardShouldPersistTaps="handled">
        <Stack style={styles.body}>
          <Text variant="h2" accessibilityRole="header">
            {t({ id: 'vote.newPoll.title', message: 'New poll' })}
          </Text>
          <View
            onLayout={(event) => {
              tops.current[0] = event.nativeEvent.layout.y;
            }}
          >
            <TextField
              label={t({ id: 'vote.newPoll.question', message: 'Question' })}
              value={draft.question}
              onChangeText={(question) => setDraft((current) => ({ ...current, question }))}
              maxLength={140}
              autoFocus
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => inputs.current[1]?.focus()}
              onFocus={() => reveal(0)}
              testID="new-poll-question"
            />
          </View>
          {draft.options.map((option, index) => {
            const last = index === draft.options.length - 1;
            return (
              <View
                key={index}
                onLayout={(event) => {
                  tops.current[index + 1] = event.nativeEvent.layout.y;
                }}
              >
                <TextField
                  label={t({ id: 'vote.newPoll.option', message: `Answer ${index + 1}` })}
                  value={option}
                  onChangeText={(text) => setOption(index, text)}
                  maxLength={80}
                  inputRef={(input) => {
                    inputs.current[index + 1] = input;
                  }}
                  {...(last
                    ? {}
                    : {
                        returnKeyType: 'next' as const,
                        submitBehavior: 'submit' as const,
                        onSubmitEditing: () => inputs.current[index + 2]?.focus(),
                      })}
                  onFocus={() => reveal(index + 1)}
                  testID={`new-poll-option-${index}`}
                />
              </View>
            );
          })}
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
        </Stack>
      </SheetScrollView>
      <View style={styles.footer}>
        {reason === null ? null : (
          <Text
            variant="caption"
            color={theme.semantic.text.secondary}
            style={styles.reason}
            testID="new-poll-reason"
          >
            {reason}
          </Text>
        )}
        <PillButton
          label={t({ id: 'vote.newPoll.post', message: 'Post poll' })}
          onPress={() => void post()}
          disabled={options === null}
          loading={create.pending}
          testID="new-poll-post"
        />
      </View>
    </Sheet>
  );
}
