/**
 * Page three as a step of the pass, shared by the current and the premium page: the draft's answers
 * (a changed answer reopens the quiz) and, once the summary is confirmed, on to home base.
 */
import { router } from 'expo-router';

import { advanceDraft, type TasteAnswer } from '@cp/domain';

import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { routeForStep } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';

export function useTasteStep() {
  useTrackStep('taste');
  const draft = usePassDraft() ?? ensureDraft();
  return {
    answers: draft.answers,
    onAnswersChange: (answers: TasteAnswer[]) =>
      updateDraft((d) => ({ ...d, answers, taste_done: false })),
    done: () => {
      const next = updateDraft((d) => advanceDraft({ ...d, taste_done: true }, 'taste'));
      if (next.step !== 'taste') router.push(routeForStep(next.step));
    },
  };
}
