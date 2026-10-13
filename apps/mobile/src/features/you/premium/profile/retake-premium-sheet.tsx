/**
 * Retake on the pass's "How you travel" as the premium form sheet: the same this-or-that cards as
 * the pass wizard (2.07), the tags filling in under them, then the summary with Save. Saving sends
 * the new answers through `set_taste` (queued offline); the tags on the pass change when the row
 * syncs back. Swiping away with answers given asks first.
 */
import type { TasteAnswer } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import {
  QuizPhotoCard,
  cardArt,
  guideFacts,
  quizCardWords,
  tagWords,
  tokekLine,
  useTasteQuiz,
} from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';
import { EmptySlot, Tag, Text, TextButton, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { setTasteCommand } from '../../profile/set-taste-command';

const TAG_TILTS = [-4, 3, -2, 4, -3, 2];

export function RetakePremiumSheet() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const [answers, setAnswers] = useState<TasteAnswer[]>([]);
  const quiz = useTasteQuiz(answers, setAnswers);
  const { send } = useCommand(setTasteCommand);
  const { question, tags } = quiz;
  const tokek = guideFacts('tokek');
  const tagColours = [th.accent.pink, th.accent.mint, th.accent.sun, th.accent.sky];

  const tagRow = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap12 }}>
      {tags.map((tag, index) => (
        <Tag
          key={tag}
          label={tagWords(tag).full}
          color={tagColours[index % tagColours.length]}
          rotate={TAG_TILTS[index % TAG_TILTS.length]}
        />
      ))}
      {question !== null ? <EmptySlot label="?" /> : null}
    </View>
  );

  return (
    <SheetScreen
      title={t({ id: 'you.profile.retakeTitle', message: 'This or that' })}
      cancelLabel={t({ id: 'you.premium.retake.cancel', message: 'Cancel' })}
      verb={{
        label: t({ id: 'you.premium.retake.save', message: 'Save' }),
        disabled: question !== null,
        onPress: () => {
          void send({ answers, source: 'quiz' });
        },
        testID: 'you-retake-save',
      }}
      dirty={answers.length > 0}
      discardPrompt={{
        title: t({ id: 'you.premium.retake.discardTitle', message: 'Keep your old answers?' }),
        message: t({
          id: 'you.premium.retake.discardLine',
          message: 'The answers you just gave go, and your pass stays as it was.',
        }),
        discard: t({ id: 'you.premium.retake.discard', message: 'Keep old ones' }),
        keep: t({ id: 'you.premium.retake.keep', message: 'Keep going' }),
      }}
      testID="you-retake"
    >
      <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap16 }}>
        {question === null ? (
          <View style={{ gap: th.space.gap16 }} testID="you-retake-summary">
            <Text variant="title" accessibilityRole="header">
              {t({ id: 'onboarding.taste.summaryTitle', message: 'How you travel' })}
            </Text>
            {tags.length > 0 ? (
              tagRow
            ) : (
              <Text variant="body" tone="muted">
                {t({
                  id: 'onboarding.taste.noTags',
                  message: 'All skipped. The guides will learn as you go.',
                })}
              </Text>
            )}
            <TextButton
              label={t({ id: 'onboarding.taste.retake', message: 'Start over' })}
              onPress={quiz.restart}
              testID="you-retake-restart"
            />
          </View>
        ) : (
          <>
            <Text variant="guide" color={th.color.banner.guide.text}>
              {tokekLine(quiz.lastTrigger, locale)}
            </Text>
            <View key={question.id} style={{ gap: th.space.gap10 }} testID="you-retake-quiz">
              <QuizPhotoCard
                side="left"
                label={quizCardWords(question, 'left').label}
                line={quizCardWords(question, 'left').line}
                pose={cardArt(question.id, 'left').pose}
                guide={tokek}
                flung={quiz.flinging === 'right'}
                onPick={quiz.pick}
              />
              <QuizPhotoCard
                side="right"
                label={quizCardWords(question, 'right').label}
                line={quizCardWords(question, 'right').line}
                pose={cardArt(question.id, 'right').pose}
                guide={tokek}
                flung={quiz.flinging === 'left'}
                onPick={quiz.pick}
              />
            </View>
            {tagRow}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TextButton
                label={t({ id: 'onboarding.taste.undo', message: 'Undo' })}
                onPress={quiz.undo}
                disabled={quiz.answeredCount === 0}
                testID="you-retake-undo"
              />
              <TextButton
                label={t({ id: 'onboarding.taste.skip', message: 'Skip this one' })}
                onPress={quiz.skip}
                testID="you-retake-skip"
              />
            </View>
          </>
        )}
      </View>
    </SheetScreen>
  );
}
