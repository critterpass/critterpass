/**
 * This or that (3a-4): two cards, one question. The top card bobs; picking a side flings the other
 * card away and the answer thuds onto ON YOUR PASS; the next pair rises. Undo and skip are always
 * there, and after the sixth answer a summary shows the tags with who can see them. Also used as
 * the profile's retake sheet (`mode="sheet"`), where answers overwrite the old ones.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import {
  nextQuestion,
  normalizeAnswers,
  tasteFromAnswers,
  undoLastAnswer,
  type TasteAnswer,
} from '@cp/domain';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion/feedback';
import { TextLink } from '@/ui/buttons/TextLink';
import { PillButton } from '@/ui/buttons/PillButton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { onboardingQuiz, tokekLine } from '../content';
import { TokekSays } from '../tokek-says';
import { FLING_MS, OR_BADGE_SIZE, QuizCard, type Side } from './QuizCard';
import { tagWords } from './tag-labels';
import { TagSlot, TagStamp } from './TagStamp';

const useStyles = makeStyles((th) => ({
  root: { gap: th.space['14'] },
  cards: { gap: th.space['8'] },
  or: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -OR_BADGE_SIZE / 2,
    width: OR_BADGE_SIZE,
    height: OR_BADGE_SIZE,
    borderRadius: OR_BADGE_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'], alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
}));

export interface TasteQuizProps {
  readonly answers: readonly TasteAnswer[];
  readonly onAnswersChange: (answers: TasteAnswer[]) => void;
  /** The summary's confirm: the answers are final (onboarding moves on; the sheet saves). */
  readonly onDone: () => void;
  /** Header counter slot is rendered by the page; the sheet shows its own. */
  readonly mode?: 'page' | 'sheet';
}

export function TasteQuiz({ answers, onAnswersChange, onDone, mode = 'page' }: TasteQuizProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const quiz = onboardingQuiz();
  const question = nextQuestion(quiz, answers);
  const [flinging, setFlinging] = useState<Side | null>(null);
  const [stampedFrom] = useState(() => normalizeAnswers(quiz, answers).length);
  const tags = tasteFromAnswers(quiz, answers).tags;
  const [lastTrigger, setLastTrigger] = useState<'taste' | 'taste_skip'>('taste');
  const answeredCount = normalizeAnswers(quiz, answers).length;
  const flingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flingTimer.current !== null) clearTimeout(flingTimer.current);
    },
    [],
  );

  const record = (value: TasteAnswer['value']) => {
    if (question === null) return;
    onAnswersChange([...answers, { q_id: question.id, value }]);
  };

  const pick = (side: Side) => {
    if (question === null || flinging !== null) return;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id.
    feedback.emit('thud.heavy');
    setFlinging(side);
    setLastTrigger('taste');
    flingTimer.current = setTimeout(() => {
      flingTimer.current = null;
      setFlinging(null);
      record(side);
    }, FLING_MS);
  };

  // A card in the air is an answer on its way: skip and undo wait for it to land, or the answer
  // would be written over the list they just changed.
  const skip = () => {
    if (flinging !== null) return;
    feedback.emit('tick');
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a content trigger id.
    setLastTrigger('taste_skip');
    record('skip');
  };

  const undo = () => {
    if (flinging !== null) return;
    feedback.emit('tick');
    onAnswersChange(undoLastAnswer(normalizeAnswers(quiz, answers)));
  };

  const tagRow = (
    <View style={styles.tags} testID="taste-tags">
      {tags.map((tag, index) => (
        <TagStamp key={tag} label={tagWords(tag).full} index={index} stamp={index >= stampedFrom} />
      ))}
      {question !== null ? <TagSlot /> : null}
    </View>
  );

  if (question === null) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a content trigger id.
    const doneLine = tokekLine('taste_done', locale);
    return (
      <View style={styles.root} testID="taste-summary">
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'onboarding.taste.summaryTitle', message: 'How you travel' })}
        </Text>
        {tags.length > 0 ? (
          tagRow
        ) : (
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'onboarding.taste.noTags',
              message: 'All skipped. The guides will learn as you go.',
            })}
          </Text>
        )}
        <Text variant="bodySm" color={theme.semantic.text.secondary} testID="taste-disclosure">
          {t({
            id: 'onboarding.taste.disclosure',
            message:
              'Your crews see these tags so plans fit everyone. You can hide them in Settings.',
          })}
        </Text>
        <TokekSays line={doneLine} />
        <PillButton
          label={
            mode === 'sheet'
              ? t({ id: 'onboarding.taste.save', message: 'Save' })
              : t({ id: 'onboarding.taste.done', message: 'That’s me' })
          }
          onPress={onDone}
          testID="taste-done"
        />
        <TextLink
          label={t({ id: 'onboarding.taste.retake', message: 'Start over' })}
          onPress={() => onAnswersChange([])}
          testID="taste-retake"
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="taste-quiz">
      <View style={styles.cards} key={question.id}>
        <QuizCard
          question={question}
          side="left"
          flung={flinging === 'right'}
          picked={flinging === 'left'}
          onPick={pick}
        />
        <QuizCard
          question={question}
          side="right"
          flung={flinging === 'left'}
          picked={flinging === 'right'}
          onPick={pick}
        />
        <View
          style={[
            styles.or,
            { backgroundColor: theme.color.paper.base, borderColor: theme.color.ink['950'] },
          ]}
          pointerEvents="none"
        >
          <Text variant="label" color={theme.color.ink['950']}>
            {upper(t({ id: 'onboarding.taste.or', message: 'or' }), locale)}
          </Text>
        </View>
      </View>
      <Text variant="eyebrow" color={theme.semantic.text.secondary}>
        {upper(t({ id: 'onboarding.taste.onYourPass', message: 'On your pass so far' }), locale)}
      </Text>
      {tagRow}
      <View style={styles.actions}>
        <TextLink
          label={t({ id: 'onboarding.taste.undo', message: 'Undo' })}
          onPress={undo}
          disabled={answeredCount === 0}
          testID="taste-undo"
        />
        <TextLink
          label={t({ id: 'onboarding.taste.skip', message: 'Skip this one' })}
          onPress={skip}
          testID="taste-skip"
        />
      </View>
      <TokekSays line={tokekLine(lastTrigger, locale)} />
    </View>
  );
}
