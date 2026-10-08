/**
 * 3a-2 "What should the guides call you?": each typed letter drops onto the pass as it lands, the
 * MRZ rewrites itself, and Tokek reacts once typing pauses, from a scripted pool.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { advanceDraft, clipGivenName, givenNameProblem } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { GlyphDrop } from '@/ui/pass-card';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { BLOCKED_NAME_WORDS, tokekLine, tokekLineCount } from '../content';
import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { routeForStep } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { OnboardingPage } from '../page-chrome';
import { OnboardingPassCard } from '../pass-view';
import { TokekSays } from '../tokek-says';
import { nameReaction, reactionDelayMs } from './name-reaction';
import type { TokekLineTrigger } from '../content';

/**
 * The keyboard rises once page one has faded in over the opened passport, not while it is still
 * crossing: the stack's fade takes 300 ms, a beat more lets the pass card settle first.
 */
export const NAME_FOCUS_DELAY_MS = 450;

export function NameScreen() {
  useTrackStep('name');
  const theme = useTheme();
  const locale = useLocale();
  const draft = usePassDraft() ?? ensureDraft();
  const [name, setName] = useState(draft.given_name);
  const [reaction, setReaction] = useState<{ trigger: TokekLineTrigger; pick: number }>({
    trigger: 'intro',
    pick: 0,
  });
  const reactions = useRef(0);

  // The field mounts again with autoFocus once the page is in (TextField takes no ref), unless
  // the user already tapped into it: a remount then would drop the letters being typed.
  const [focusReady, setFocusReady] = useState(false);
  const userFocused = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!userFocused.current) setFocusReady(true);
    }, NAME_FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const typed = useRef(false);
  useEffect(() => {
    // Tokek keeps his intro line until the user types.
    if (!typed.current) return undefined;
    const timer = setTimeout(() => {
      const trigger = nameReaction(name, BLOCKED_NAME_WORDS);
      reactions.current += 1;
      setReaction({ trigger, pick: reactions.current % Math.max(1, tokekLineCount(trigger)) });
    }, reactionDelayMs(name));
    return () => clearTimeout(timer);
  }, [name]);

  const onChange = (text: string) => {
    typed.current = true;
    const clipped = clipGivenName(text);
    setName(clipped);
    updateDraft((d) => ({ ...d, given_name: clipped }));
  };

  const problem = givenNameProblem(name, BLOCKED_NAME_WORDS);
  const onNext = () => {
    const next = updateDraft((d) =>
      advanceDraft({ ...d, given_name: name.trim() }, 'name', BLOCKED_NAME_WORDS),
    );
    if (next.step !== 'name') router.push(routeForStep(next.step));
  };

  const line = tokekLine(reaction.trigger, locale, { name: name.trim() }, reaction.pick);
  return (
    <OnboardingPage
      page={1}
      testID="onboarding-name"
      footer={
        <PillButton
          label={t({ id: 'onboarding.name.next', message: 'Next' })}
          onPress={onNext}
          disabled={problem !== null}
          testID="onboarding-name-next"
        />
      }
    >
      <OnboardingPassCard
        draft={{ ...draft, given_name: name }}
        name={
          <GlyphDrop
            text={name}
            caret
            caretColor={theme.color.pink}
            testID="onboarding-name-glyphs"
          />
        }
      />
      <Text variant="h1" accessibilityRole="header">
        {t({ id: 'onboarding.name.title', message: 'What should the guides call you?' })}
      </Text>
      <TextField
        label={t({ id: 'onboarding.name.label', message: 'Your first name' })}
        labelHidden
        value={name}
        onChangeText={onChange}
        key={focusReady ? 'focus' : 'wait'}
        autoFocus={focusReady}
        onFocus={() => {
          userFocused.current = true;
        }}
        autoCapitalize="words"
        autoCorrect={false}
        textContentType="givenName"
        autoComplete="given-name"
        returnKeyType="next"
        onSubmitEditing={() => {
          if (problem === null) onNext();
        }}
        status={problem === 'blocked' ? 'error' : 'idle'}
        testID="onboarding-name-field"
      />
      <TokekSays line={line} testID="onboarding-name-tokek" />
    </OnboardingPage>
  );
}
