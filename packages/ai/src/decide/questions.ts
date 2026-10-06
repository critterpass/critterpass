/**
 * Typed decision questions (https://docs.typesafe.ai/api): `noul` (yes-probability), `choice` (one
 * of up to 255 named options) and `score` (2–10 ordered levels). The answer type of every key is
 * inferred from the question map, and `answersSchema` validates a response against exactly that map:
 * a missing, extra or mistyped answer is rejected rather than guessed.
 *
 * Every answer carries a `confidence` in 0..1. Jev reports it for choice and score; for a yes/no
 * answer it is derived the same way as for a two-option choice, `|2p − 1|`. Probabilities are
 * `null` when the fast-tier twin answered (its values come from labels, ./fallback.ts).
 */
import { z } from 'zod';

import { GatewayConfigError } from '../errors';

/** A question or criterion: plain text, or structured data the text refers to by name. */
export type Instructions = string | Readonly<Record<string, unknown>> | readonly unknown[];

export interface NoulQuestion {
  readonly type: 'noul';
  readonly instructions: Instructions;
  readonly criteria?: { readonly true?: Instructions; readonly false?: Instructions };
}

export interface ChoiceQuestion<Option extends string = string> {
  readonly type: 'choice';
  readonly instructions: Instructions;
  /** Option → what it means (`null` when the name says it all). */
  readonly criteria: Readonly<Record<Option, Instructions | null>>;
}

export interface ScoreQuestion {
  readonly type: 'score';
  readonly instructions: Instructions;
  /** Ordered level descriptions, lowest first; the answer is a weighted level index. */
  readonly criteria: readonly Instructions[];
}

export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type QuestionMap = Readonly<Record<string, Question>>;

export interface NoulAnswer {
  readonly type: 'noul';
  /** Probability of yes, 0..1. */
  readonly noul: number;
  readonly confidence: number;
}

export interface ChoiceAnswer<Option extends string = string> {
  readonly type: 'choice';
  readonly choice: Option;
  readonly probabilities: Readonly<Record<Option, number>> | null;
  readonly confidence: number;
}

export interface ScoreAnswer {
  readonly type: 'score';
  /** Probability-weighted level index (0 = the first level); can land between levels. */
  readonly score: number;
  /** Level index (as a string key) → probability. */
  readonly probabilities: Readonly<Record<string, number>> | null;
  readonly confidence: number;
}

export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type AnswerOf<Q extends Question> =
  Q extends ChoiceQuestion<infer Option>
    ? ChoiceAnswer<Option>
    : Q extends ScoreQuestion
      ? ScoreAnswer
      : NoulAnswer;

export type Answers<Q extends QuestionMap> = { readonly [K in keyof Q]: AnswerOf<Q[K]> };

export const MAX_CHOICE_OPTIONS = 255;
export const MIN_SCORE_LEVELS = 2;
export const MAX_SCORE_LEVELS = 10;

export function noul(
  instructions: Instructions,
  criteria?: { readonly true?: Instructions; readonly false?: Instructions },
): NoulQuestion {
  return criteria === undefined
    ? { type: 'noul', instructions }
    : { type: 'noul', instructions, criteria };
}

export function choice<const Option extends string>(
  instructions: Instructions,
  criteria: Readonly<Record<Option, Instructions | null>>,
): ChoiceQuestion<Option> {
  return { type: 'choice', instructions, criteria };
}

export function score(instructions: Instructions, levels: readonly Instructions[]): ScoreQuestion {
  return { type: 'score', instructions, criteria: levels };
}

/** Confidence of a yes/no answer: 0 at p = 0.5, 1 at p = 0 or 1. */
export function noulConfidence(p: number): number {
  return Math.abs(2 * p - 1);
}

/** Rejects a question map the API would refuse, before any request is sent. */
export function validateQuestions(questions: QuestionMap): void {
  const keys = Object.keys(questions);
  if (keys.length === 0) throw new GatewayConfigError('a decision needs at least one question');
  for (const key of keys) {
    const question = questions[key];
    if (question?.type === 'choice') {
      const count = Object.keys(question.criteria).length;
      if (count < 2 || count > MAX_CHOICE_OPTIONS) {
        throw new GatewayConfigError(`choice ${key} needs 2–${MAX_CHOICE_OPTIONS} options`);
      }
    }
    if (question?.type === 'score') {
      const count = question.criteria.length;
      if (count < MIN_SCORE_LEVELS || count > MAX_SCORE_LEVELS) {
        throw new GatewayConfigError(
          `score ${key} needs ${MIN_SCORE_LEVELS}–${MAX_SCORE_LEVELS} levels`,
        );
      }
    }
  }
}

const probability = z.number().min(0).max(1);

function optionsOf(question: ChoiceQuestion): [string, ...string[]] {
  const [first, ...rest] = Object.keys(question.criteria);
  if (first === undefined) throw new GatewayConfigError('choice question without options');
  return [first, ...rest];
}

/** Jev's answer for one question, normalised to the shared answer shape. */
function jevAnswerSchema(question: Question): z.ZodType<Answer> {
  switch (question.type) {
    case 'noul':
      return z
        .object({ type: z.literal('noul'), noul: probability })
        .transform((a): NoulAnswer => ({ ...a, confidence: noulConfidence(a.noul) }));
    case 'choice': {
      const option = z.enum(optionsOf(question));
      return z
        .object({
          type: z.literal('choice'),
          choice: option,
          probabilities: z.record(option, probability),
          confidence: probability,
        })
        .transform((a): ChoiceAnswer => ({
          type: a.type,
          choice: a.choice,
          probabilities: a.probabilities,
          confidence: a.confidence,
        }));
    }
    case 'score': {
      const top = question.criteria.length - 1;
      return z
        .object({
          type: z.literal('score'),
          score: z.number().min(0).max(top),
          probabilities: z.record(z.string(), probability),
          confidence: probability,
        })
        .transform((a): ScoreAnswer => ({
          type: a.type,
          score: a.score,
          probabilities: a.probabilities,
          confidence: a.confidence,
        }));
    }
  }
}

/** Validates Jev's `answers` against the question map: every key present, no unknown keys. */
export function answersSchema<Q extends QuestionMap>(questions: Q): z.ZodType<Answers<Q>> {
  const shape = Object.fromEntries(
    Object.entries(questions).map(([key, question]) => [key, jevAnswerSchema(question)]),
  );
  return z.strictObject(shape) as unknown as z.ZodType<Answers<Q>>;
}

/**
 * What a redraft note asks of the day, one yes/no per closed label in a single call: a note can
 * ask two things at once ("sleep in, then something relaxed"). A note that says none of them is
 * "other": the guide still reads it as written.
 */
export const REDRAFT_NOTE_ASKS = [
  'slower',
  'faster',
  'later_start',
  'earlier_start',
  'indoor',
  'cheaper',
  'swap_stop',
  'less_walking',
] as const;
export type RedraftNoteAsk = (typeof REDRAFT_NOTE_ASKS)[number];

const REDRAFT_NOTE_ASK_TEXT: Readonly<Record<RedraftNoteAsk, string>> = {
  slower:
    'Does the note ask for a slower, calmer or more relaxed pace, or fewer stops? It may ask other things too.',
  faster:
    'Does the note ask for more stops in total or a fuller, busier day? Asking for more of one kind of place is not this.',
  later_start:
    'Does the note ask to start the day later, sleep in or have a late morning? A slower pace alone is not this.',
  earlier_start: 'Does the note ask to start the day earlier?',
  indoor: 'Does the note mention rain or bad weather, or ask for places indoors?',
  cheaper: 'Does the note ask for a cheaper day, lower prices or free places?',
  swap_stop: 'Does the note ask to swap, replace or drop a particular stop?',
  less_walking:
    'Does the note ask for less walking or fewer walks between stops ("bớt đi bộ", "ít đi bộ")? It may ask other things too.',
};

const REDRAFT_NOTE_STATE =
  'The state is a note a traveller wrote when asking for one day of a trip plan to be redone. It may be in any language; Vietnamese is often typed without its accents ("cham hon" is "chậm hơn", "slower"). Answer yes only when the note itself asks for this.';

export function redraftNoteQuestions(): Readonly<Record<RedraftNoteAsk, NoulQuestion>> {
  return Object.fromEntries(
    REDRAFT_NOTE_ASKS.map((ask) => [
      ask,
      noul(`${REDRAFT_NOTE_STATE} ${REDRAFT_NOTE_ASK_TEXT[ask]}`),
    ]),
  ) as Record<RedraftNoteAsk, NoulQuestion>;
}

/** The times of day a must-do can be held to: a place profile's own labels, or none. */
export const MUST_DO_TIMES = [
  'early_morning',
  'morning',
  'midday',
  'afternoon',
  'sunset',
  'evening',
  'after_dark',
  'any',
] as const;
export type MustDoTime = (typeof MUST_DO_TIMES)[number];

/** Which of our search's candidates (named `a`..`e` in the state) a typed must-do means, or none. */
export function mustDoPlaceQuestion(candidateKeys: readonly string[]): ChoiceQuestion {
  return choice(
    'The state has a must-do a traveller typed for a trip and the places our search found for it. Which candidate is the place the must-do means? Answer none when it names no particular place, or a place not among the candidates.',
    {
      ...Object.fromEntries(candidateKeys.map((key) => [key, `candidate ${key}`])),
      none: 'none of the candidates',
    },
  );
}

/** The time of day a typed must-do asks for, or `any`. */
export function mustDoTimeQuestion(): ChoiceQuestion<MustDoTime> {
  return choice(
    'When in the day does the must-do ask to be done? Answer any unless its words name a time of day (sunrise, a night market, dinner, after dark).',
    {
      early_morning: 'sunrise or early morning, before about 7:00',
      morning: 'the morning',
      midday: 'around noon or lunch',
      afternoon: 'the afternoon',
      sunset: 'sunset',
      evening: 'the evening or dinner',
      after_dark: 'at night, after dark',
      any: 'no time of day named',
    },
  );
}
