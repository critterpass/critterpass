/**
 * The pass draft a new user fills in before their pass is issued: name → photo → taste → home →
 * issued → saved. The draft is persisted on the device after every change so a relaunch resumes
 * at the step the user left; `resumeStep` never lets a relaunch skip a step whose data is missing.
 */
import { z } from 'zod';

import { iataSchema } from '../airports/types';
import { tasteAnswerSchema } from '../taste/quiz-to-tags';
import { givenNameProblem } from './name';
import { avatarChoiceSchema } from './wire';

export const PASS_DRAFT_STEPS = ['name', 'photo', 'taste', 'home', 'issued', 'saved'] as const;
export type PassDraftStep = (typeof PASS_DRAFT_STEPS)[number];

export const passDraftSchema = z.object({
  v: z.literal(1),
  step: z.enum(PASS_DRAFT_STEPS),
  pass_id: z.uuid(),
  given_name: z.string(),
  avatar: avatarChoiceSchema.nullable(),
  /** Local file of a picked photo before its upload finishes (shown in the frame meanwhile). */
  photo_uri: z.string().nullable(),
  answers: z.array(tasteAnswerSchema),
  /** True once the quiz reached its summary (answers may still be fewer than six: skips). */
  taste_done: z.boolean(),
  home_iata: iataSchema.nullable(),
  /** Reserved by `start_pass`; null until it syncs (the pass shows the placeholder). */
  number: z.string().nullable(),
  issued_at: z.iso.datetime({ offset: true }).nullable(),
  saved: z.boolean(),
});
export type PassDraft = z.infer<typeof passDraftSchema>;

export function newPassDraft(passId: string): PassDraft {
  return {
    v: 1,
    step: 'name',
    pass_id: passId,
    given_name: '',
    avatar: null,
    photo_uri: null,
    answers: [],
    taste_done: false,
    home_iata: null,
    number: null,
    issued_at: null,
    saved: false,
  };
}

/** Whether a step's own data is complete enough to move past it. */
export function stepComplete(
  draft: PassDraft,
  step: PassDraftStep,
  blockedNames: readonly string[] = [],
): boolean {
  switch (step) {
    case 'name':
      return givenNameProblem(draft.given_name, blockedNames) === null;
    case 'photo':
      return draft.avatar !== null;
    case 'taste':
      return draft.taste_done;
    case 'home':
      return draft.home_iata !== null;
    case 'issued':
      return draft.issued_at !== null;
    case 'saved':
      return draft.saved;
  }
}

const indexOf = (step: PassDraftStep): number => PASS_DRAFT_STEPS.indexOf(step);

/** The earliest step at or before the stored one whose data is missing; else the stored step. */
export function resumeStep(draft: PassDraft): PassDraftStep {
  const stored = indexOf(draft.step);
  for (const step of PASS_DRAFT_STEPS.slice(0, stored)) {
    if (!stepComplete(draft, step)) return step;
  }
  return draft.step;
}

/** Moves to the next step; stays put when the current step is incomplete or already last. */
export function advanceDraft(draft: PassDraft, blockedNames: readonly string[] = []): PassDraft {
  const at = indexOf(draft.step);
  const next = PASS_DRAFT_STEPS[at + 1];
  if (next === undefined || !stepComplete(draft, draft.step, blockedNames)) return draft;
  return { ...draft, step: next };
}

/** Back one step while the pass is still a draft; an issued pass never goes back. */
export function backDraft(draft: PassDraft): PassDraft {
  const at = indexOf(draft.step);
  if (at === 0 || at >= indexOf('issued')) return draft;
  const previous = PASS_DRAFT_STEPS[at - 1];
  return previous === undefined ? draft : { ...draft, step: previous };
}

/** Reads a persisted draft; anything unreadable starts over rather than crashing onboarding. */
export function parsePassDraft(raw: unknown): PassDraft | null {
  const parsed = passDraftSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
