/**
 * This-or-that answers → ranked taste tags. The quiz itself is content (the `taste_quiz` release);
 * this module only needs each question's id and its two sides' tags, so it takes that shape
 * structurally and never depends on the content package.
 */
import { z } from 'zod';

import {
  chronotypeOf,
  paceOf,
  PASS_STYLE_TAG_COUNT,
  type Chronotype,
  type Pace,
  type TagSource,
  type TasteTag,
} from './taxonomy';

export interface QuizSideShape {
  readonly tags: readonly TasteTag[];
}

export interface QuizQuestionShape {
  readonly id: string;
  readonly order: number;
  readonly left: QuizSideShape;
  readonly right: QuizSideShape;
}

/** `skip` answers a question without adding tags (the undesigned "skip question" state). */
export const TASTE_ANSWER_VALUES = ['left', 'right', 'skip'] as const;
export const tasteAnswerSchema = z
  .object({
    q_id: z.string().min(1).max(64),
    value: z.enum(TASTE_ANSWER_VALUES),
  })
  .strict();
export type TasteAnswer = z.infer<typeof tasteAnswerSchema>;

export interface TasteResult {
  /** Ranked: most-picked first, ties broken by quiz order, then by the side's own tag order. */
  readonly tags: readonly TasteTag[];
  readonly tagSources: Readonly<Partial<Record<TasteTag, TagSource>>>;
  readonly chronotype: Chronotype | null;
  readonly pace: Pace | null;
}

function orderedQuestions<Q extends QuizQuestionShape>(quiz: readonly Q[]): Q[] {
  return [...quiz].sort((a, b) => a.order - b.order);
}

/** Latest answer per question wins (undo and retake re-answer); unknown question ids are ignored. */
export function normalizeAnswers(
  quiz: readonly QuizQuestionShape[],
  answers: readonly TasteAnswer[],
): TasteAnswer[] {
  const known = new Set(quiz.map((q) => q.id));
  const latest = new Map<string, TasteAnswer>();
  for (const answer of answers) {
    if (known.has(answer.q_id)) latest.set(answer.q_id, answer);
  }
  return orderedQuestions(quiz)
    .map((q) => latest.get(q.id))
    .filter((a): a is TasteAnswer => a !== undefined);
}

export function tasteFromAnswers(
  quiz: readonly QuizQuestionShape[],
  answers: readonly TasteAnswer[],
  source: TagSource = 'quiz',
): TasteResult {
  const byId = new Map(quiz.map((q) => [q.id, q]));
  const counts = new Map<TasteTag, { count: number; first: number }>();
  let position = 0;
  for (const answer of normalizeAnswers(quiz, answers)) {
    const question = byId.get(answer.q_id);
    if (question === undefined || answer.value === 'skip') continue;
    for (const tag of question[answer.value].tags) {
      const seen = counts.get(tag);
      if (seen === undefined) counts.set(tag, { count: 1, first: position++ });
      else seen.count += 1;
    }
  }
  const tags = [...counts.entries()]
    .sort(([, a], [, b]) => b.count - a.count || a.first - b.first)
    .map(([tag]) => tag);
  const tagSources: Partial<Record<TasteTag, TagSource>> = {};
  for (const tag of tags) tagSources[tag] = source;
  return { tags, tagSources, chronotype: chronotypeOf(tags), pace: paceOf(tags) };
}

/** The pass's travel-style tags: the top three. */
export function passStyleTags(tags: readonly TasteTag[]): TasteTag[] {
  return tags.slice(0, PASS_STYLE_TAG_COUNT);
}

/** The first unanswered question in quiz order; null once all are answered or skipped. */
export function nextQuestion<Q extends QuizQuestionShape>(
  quiz: readonly Q[],
  answers: readonly TasteAnswer[],
): Q | null {
  const answered = new Set(normalizeAnswers(quiz, answers).map((a) => a.q_id));
  return orderedQuestions(quiz).find((q) => !answered.has(q.id)) ?? null;
}

/** Drops the most recent answer (the undesigned "undo last answer" state). */
export function undoLastAnswer(answers: readonly TasteAnswer[]): TasteAnswer[] {
  return answers.slice(0, -1);
}
