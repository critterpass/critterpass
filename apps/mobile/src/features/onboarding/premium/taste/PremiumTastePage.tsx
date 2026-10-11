/**
 * 2.07 "This or that": two cards, one question, six questions counted in the header. Picking a
 * card flings the other away and the answer's tag lands on "On your pass so far"; undo and skip
 * stay one tap away. After the sixth, the summary shows the tags and who sees them.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, EmptySlot, GuideNote, Tag, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { tokekLine } from '../../content';
import { guideFacts } from '../../guide-faces';
import { useLocale } from '@/lib/i18n/use-locale';
import { cardArt } from '../../taste/card-art';
import { quizCardWords } from '../../taste/quiz-copy';
import { tagWords } from '../../taste/tag-labels';
import { useTasteQuiz } from '../../taste/use-taste-quiz';
import { useTasteStep } from '../../taste/use-taste-step';
import { WizardHeader } from '../components/WizardHeader';
import { WizardPage } from '../components/WizardPage';
import { QuizPhotoCard } from './QuizPhotoCard';

const TAG_TILTS = [-4, 3, -2, 4, -3, 2];

export function PremiumTastePage() {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const step = useTasteStep();
  const quiz = useTasteQuiz(step.answers, step.onAnswersChange);
  const { question, tags } = quiz;
  const tokek = guideFacts('tokek');
  const tagColours = [theme.accent.pink, theme.accent.mint, theme.accent.sun, theme.accent.sky];
  const backLabel = t({ id: 'onboarding.invite.code.back', message: 'Back' });

  const tagRow = (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap12 }}
      testID="taste-tags"
    >
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

  if (question === null) {
    return (
      <WizardPage
        backLabel={backLabel}
        header={
          <WizardHeader current={3} total={4} backLabel={backLabel} onBack={() => router.back()} />
        }
        testID="onboarding-taste"
        footer={
          <>
            <Button
              label={t({ id: 'onboarding.taste.done', message: 'That’s me' })}
              onPress={step.done}
              testID="taste-done"
            />
            <TextButton
              label={t({ id: 'onboarding.taste.retake', message: 'Start over' })}
              onPress={quiz.restart}
              testID="taste-retake"
            />
          </>
        }
      >
        <View testID="taste-summary" style={{ gap: theme.space.gap16 }}>
          <Text variant="largeTitle" accessibilityRole="header">
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
          <Text variant="caption" tone="muted" testID="taste-disclosure">
            {t({
              id: 'onboarding.taste.disclosure',
              message:
                'Your crews see these tags so plans fit everyone. You can hide them in Settings.',
            })}
          </Text>
          <GuideNote
            name={tokek.name}
            critter={tokek.kind}
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a content trigger id.
            text={tokekLine('taste_done', locale)}
          />
        </View>
      </WizardPage>
    );
  }

  const left = quizCardWords(question, 'left');
  const right = quizCardWords(question, 'right');
  return (
    <WizardPage
      backLabel={backLabel}
      header={
        <WizardHeader
          current={quiz.current}
          total={quiz.quiz.length}
          backLabel={backLabel}
          onBack={() => router.back()}
          testID="taste-counter"
        />
      }
      testID="onboarding-taste"
    >
      <View style={{ gap: theme.space.gap6 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'onboarding.taste.title', message: 'This or that' })}
        </Text>
        <Text variant="guide" color={theme.color.banner.guide.text}>
          {tokekLine(quiz.lastTrigger, locale)}
        </Text>
      </View>
      <View key={question.id} style={{ gap: theme.space.gap10 }} testID="taste-quiz">
        <QuizPhotoCard
          side="left"
          label={left.label}
          line={left.line}
          pose={cardArt(question.id, 'left').pose}
          guide={tokek}
          flung={quiz.flinging === 'right'}
          onPick={quiz.pick}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            alignSelf: 'center',
            top: '50%',
            marginTop: -26,
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 4,
            borderColor: theme.color.ground,
            backgroundColor: theme.color.ink,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
          }}
        >
          <Text variant="rowTitle" tone="onInk">
            {t({ id: 'onboarding.taste.or', message: 'or' })}
          </Text>
        </View>
        <QuizPhotoCard
          side="right"
          label={right.label}
          line={right.line}
          pose={cardArt(question.id, 'right').pose}
          guide={tokek}
          flung={quiz.flinging === 'left'}
          onPick={quiz.pick}
        />
      </View>
      <View style={{ gap: theme.space.gap12 }}>
        <Text variant="label" tone="muted">
          {t({ id: 'onboarding.taste.onYourPass', message: 'On your pass so far' })}
        </Text>
        {tagRow}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <TextButton
          label={t({ id: 'onboarding.taste.undo', message: 'Undo' })}
          onPress={quiz.undo}
          disabled={quiz.answeredCount === 0}
          testID="taste-undo"
        />
        <TextButton
          label={t({ id: 'onboarding.taste.skip', message: 'Skip this one' })}
          onPress={quiz.skip}
          testID="taste-skip"
        />
      </View>
    </WizardPage>
  );
}
