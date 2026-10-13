/**
 * New poll (4.01), the sheet over the crew chat: Cancel and Post in its header (Post once there is
 * a question and two different answers), the question focused on open, the answers (return moves
 * to the next; up to six), when it closes, and whether minds may change. Posting queues
 * `create_poll` (it works offline); swiping down with something typed asks first.
 */
import { generateUuidV7, POLL_MAX_OPTIONS } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { goBackOr } from '@/lib/navigation/back';
import {
  Icon,
  ListCard,
  PressableScale,
  SegmentedControl,
  Text,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { createPollCommand } from '../../data/vote-commands';
import {
  DEADLINE_MS,
  postableOptions,
  postBlocker,
  type PollDeadline,
  type PollDraft,
} from '../../poll/create-poll-sheet';

const ROW = 50;

export function NewPollSheet({ crewId }: { readonly crewId: string }) {
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const create = useCommand(createPollCommand);
  const [draft, setDraft] = useState<PollDraft>({
    question: '',
    options: ['', ''],
    deadline: 'day',
    allowChange: true,
  });
  const inputs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);
  const options = postableOptions(draft);
  const blocker = postBlocker(draft);
  const dirty = draft.question !== '' || draft.options.some((option) => option !== '');
  const setOption = (index: number, text: string) =>
    setDraft((current) => ({
      ...current,
      options: current.options.map((option, i) => (i === index ? text : option)),
    }));
  const post = async () => {
    if (options === null) return false;
    const window = DEADLINE_MS[draft.deadline];
    await create.send({
      poll_id: generateUuidV7(),
      crew_id: crewId,
      kind: 'generic',
      question: draft.question.trim(),
      options: options.map((label) => ({ label, kind: 'text' as const })),
      allow_change: draft.allowChange,
      ...(window === null ? {} : { closes_at: new Date(Date.now() + window).toISOString() }),
    });
    goBackOr();
    return false;
  };
  const field = {
    fontSize: theme.type.field.size,
    color: theme.color.ink,
  } as const;
  return (
    <SheetScreen
      title={t({ id: 'vote.newPoll.title', message: 'New poll' })}
      cancelLabel={t({ id: 'vote.premium.cancel', message: 'Cancel' })}
      verb={{
        label: t({ id: 'vote.premium.post', message: 'Post' }),
        onPress: post,
        disabled: options === null || create.pending,
        testID: 'new-poll-post',
      }}
      dirty={dirty}
      discardPrompt={{
        title: t({ id: 'vote.premium.newPoll.discardTitle', message: 'Drop this poll?' }),
        message: t({
          id: 'vote.premium.newPoll.discardLine',
          message: 'The question and answers you typed are not kept.',
        }),
        discard: t({ id: 'vote.premium.discard', message: 'Discard' }),
        keep: t({ id: 'vote.premium.keepEditing', message: 'Keep editing' }),
      }}
      testID="new-poll"
    >
      <View style={{ paddingHorizontal: theme.space.gap16, gap: theme.space.gap16 }}>
        <TextInput
          ref={(node) => {
            inputs.current[0] = node;
          }}
          autoFocus
          multiline
          value={draft.question}
          onChangeText={(question) => setDraft((current) => ({ ...current, question }))}
          placeholder={t({ id: 'vote.premium.newPoll.ask', message: 'Ask the crew something' })}
          placeholderTextColor={theme.color.placeholder}
          selectionColor={theme.color.caret}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => inputs.current[1]?.focus()}
          accessibilityLabel={t({ id: 'vote.newPoll.question', message: 'Question' })}
          testID="new-poll-question"
          style={[
            theme.type.emptyTitle,
            { color: theme.color.ink, marginTop: theme.space.gap16, padding: 0 },
          ]}
        />
        <ListCard>
          {draft.options.map((option, index) => (
            <View
              key={index}
              style={{
                height: ROW,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
                paddingHorizontal: theme.space.rowPadH,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: theme.color.outlineEmpty,
                }}
              />
              <TextInput
                ref={(node) => {
                  inputs.current[index + 1] = node;
                }}
                value={option}
                onChangeText={(text) => setOption(index, text)}
                placeholder={t({ id: 'vote.newPoll.option', message: `Answer ${index + 1}` })}
                placeholderTextColor={theme.color.placeholder}
                selectionColor={theme.color.caret}
                returnKeyType={index === draft.options.length - 1 ? 'done' : 'next'}
                submitBehavior={index === draft.options.length - 1 ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => inputs.current[index + 2]?.focus()}
                accessibilityLabel={t({
                  id: 'vote.newPoll.option',
                  message: `Answer ${index + 1}`,
                })}
                testID={`new-poll-option-${String(index)}`}
                style={[field, { flex: 1, padding: 0 }]}
              />
            </View>
          ))}
          {draft.options.length >= POLL_MAX_OPTIONS ? null : (
            <PressableScale
              onPress={() =>
                setDraft((current) => ({ ...current, options: [...current.options, ''] }))
              }
              accessibilityRole="button"
              testID="new-poll-add-option"
              style={{
                height: ROW,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
                paddingHorizontal: theme.space.rowPadH,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: theme.color.status.rain.text,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="plus" size={14} color={theme.color.onInk} />
              </View>
              <Text variant="headline" color={theme.color.status.rain.text}>
                {t({ id: 'vote.newPoll.addOption', message: 'Add an answer' })}
              </Text>
            </PressableScale>
          )}
        </ListCard>
        {blocker === 'same' ? (
          <Text variant="caption" color={theme.color.destructive.helper}>
            {t({ id: 'vote.newPoll.sameAnswers', message: 'Two answers are the same.' })}
          </Text>
        ) : null}
        <View style={{ gap: theme.space.gap8 }}>
          <Text variant="label" tone="muted" style={{ paddingHorizontal: theme.space.gap6 }}>
            {t({ id: 'vote.newPoll.deadline', message: 'Closes' })}
          </Text>
          <SegmentedControl<PollDeadline>
            options={[
              { value: 'none', label: t({ id: 'vote.newPoll.never', message: 'When all vote' }) },
              { value: 'hour', label: t({ id: 'vote.newPoll.hour', message: '1 hour' }) },
              { value: 'day', label: t({ id: 'vote.newPoll.day', message: '1 day' }) },
              { value: 'days', label: t({ id: 'vote.newPoll.threeDays', message: '3 days' }) },
            ]}
            value={draft.deadline}
            onChange={(deadline) => setDraft((current) => ({ ...current, deadline }))}
            accessibilityLabel={t({ id: 'vote.newPoll.deadline', message: 'Closes' })}
            testID="new-poll-deadline"
          />
        </View>
        <ListCard>
          <View
            style={{
              height: 52,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: theme.space.rowPadH,
            }}
          >
            <Text variant="body" style={{ flex: 1 }}>
              {t({ id: 'vote.newPoll.allowChange', message: 'People can change their vote' })}
            </Text>
            <Toggle
              value={draft.allowChange}
              onChange={(allowChange) => setDraft((current) => ({ ...current, allowChange }))}
              accessibilityLabel={t({
                id: 'vote.newPoll.allowChange',
                message: 'People can change their vote',
              })}
              testID="new-poll-allow-change"
            />
          </View>
        </ListCard>
      </View>
    </SheetScreen>
  );
}
