/**
 * 3a-12's prefill: what the inviter knew (first name, home airport hint, the taste tags they
 * confirmed) poured into a pass draft the invitee can change in three taps. Tags become chip picks
 * on the quiz: a question whose side carries a prefilled tag starts on that side, recorded as
 * chips (the pass keeps where each tag came from). Nothing here leaves the device before ISSUE.
 */
import {
  isTasteTag,
  tasteFromChips,
  type PassDraft,
  type QuizQuestionShape,
  type TasteAnswer,
  type TasteTag,
} from '@cp/domain';

export interface InvitePrefill {
  readonly givenName: string | null;
  readonly homeIata: string | null;
  readonly tags: readonly TasteTag[];
}

export function prefillOf(
  preview: {
    readonly invitee_first_name?: string | null | undefined;
    readonly invitee_home_hint?: string | null | undefined;
    readonly invitee_tags?: readonly string[] | undefined;
  } | null,
): InvitePrefill {
  return {
    givenName: preview?.invitee_first_name ?? null,
    homeIata: preview?.invitee_home_hint ?? null,
    tags: (preview?.invitee_tags ?? []).filter(isTasteTag),
  };
}

/** The chip picks that carry `tags`: the first side of each question naming one of them. */
export function answersForTags(
  quiz: readonly QuizQuestionShape[],
  tags: readonly TasteTag[],
): TasteAnswer[] {
  const wanted = new Set(tags);
  const answers: TasteAnswer[] = [];
  for (const question of [...quiz].sort((a, b) => a.order - b.order)) {
    if (question.left.tags.some((tag) => wanted.has(tag))) {
      answers.push({ q_id: question.id, value: 'left' });
    } else if (question.right.tags.some((tag) => wanted.has(tag))) {
      answers.push({ q_id: question.id, value: 'right' });
    }
  }
  return answers;
}

/** The tags a set of chip picks gives the pass, ranked as the pass shows them. */
export function tagsFromAnswers(
  quiz: readonly QuizQuestionShape[],
  answers: readonly TasteAnswer[],
): readonly TasteTag[] {
  return tasteFromChips(quiz, answers).tags;
}

/** A draft carrying the prefill, keeping anything the invitee already typed. */
export function applyPrefill(
  draft: PassDraft,
  prefill: InvitePrefill,
  quiz: readonly QuizQuestionShape[],
): PassDraft {
  return {
    ...draft,
    given_name: draft.given_name.length > 0 ? draft.given_name : (prefill.givenName ?? ''),
    home_iata: draft.home_iata ?? prefill.homeIata,
    answers: draft.answers.length > 0 ? draft.answers : answersForTags(quiz, prefill.tags),
  };
}
