/**
 * Page one's working state, shared by the current and the premium name page: the typed name (any
 * script, clipped to the pass's limit), whether it can go on the pass, Tokek's reaction once typing
 * pauses, the delayed autofocus after the page lands, and Next.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { advanceDraft, clipGivenName, givenNameProblem, type PassDraft } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';

import { BLOCKED_NAME_WORDS, tokekLine, tokekLineCount, type TokekLineTrigger } from '../content';
import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { routeForStep } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { nameReaction, reactionDelayMs } from './name-reaction';

/**
 * The keyboard rises once page one has faded in over the opened passport, not while it is still
 * crossing: the stack's fade takes 300 ms, a beat more lets the pass card settle first.
 */
export const NAME_FOCUS_DELAY_MS = 450;

export interface NameStep {
  readonly draft: PassDraft;
  readonly name: string;
  readonly onChange: (text: string) => void;
  /** Why the name cannot go on the pass yet (`null` when it can). */
  readonly problem: ReturnType<typeof givenNameProblem>;
  readonly next: () => void;
  /** Tokek's current line. */
  readonly line: string;
  /** The page has landed: mount the field focused. */
  readonly focusReady: boolean;
  /** The person tapped into the field before the delay ran out. */
  readonly onFocus: () => void;
}

export function useNameStep(): NameStep {
  useTrackStep('name');
  const locale = useLocale();
  const draft = usePassDraft() ?? ensureDraft();
  const [name, setName] = useState(draft.given_name);
  // Tokek's line is about the name as it stood when he reacted: it keeps still while the next
  // letters go in, rather than rewriting (and re-wrapping) itself on every keystroke.
  const [reaction, setReaction] = useState<{
    trigger: TokekLineTrigger;
    pick: number;
    name: string;
  }>({ trigger: 'intro', pick: 0, name: '' });
  const reactions = useRef(0);

  // The field mounts again with autoFocus once the page is in (it takes no ref), unless the user
  // already tapped into it: a remount then would drop the letters being typed.
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
      setReaction({
        trigger,
        pick: reactions.current % Math.max(1, tokekLineCount(trigger)),
        name: name.trim(),
      });
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
  const next = () => {
    if (problem !== null) return;
    const moved = updateDraft((d) =>
      advanceDraft({ ...d, given_name: name.trim() }, 'name', BLOCKED_NAME_WORDS),
    );
    if (moved.step !== 'name') router.push(routeForStep(moved.step));
  };

  return {
    draft,
    name,
    onChange,
    problem,
    next,
    line: tokekLine(reaction.trigger, locale, { name: reaction.name }, reaction.pick),
    focusReady,
    onFocus: () => {
      userFocused.current = true;
    },
  };
}
