/**
 * Taste quiz (3a-4): six this-or-that questions whose answers map to taste tags. The designed
 * third question (Sunrise summit / Sleep till ten) ships exactly as drawn; the model writes the
 * other five in the same voice.
 */
import { QUIZ_LENGTH, quizQuestionItemSchema, TASTE_TAGS, type ContentItem } from '@cp/content';
import { z } from 'zod';

import { registerKind } from '../registry';
import type { KindModule } from '../types';

export const DESIGNED_QUESTION: ContentItem<'taste_quiz'> = {
  id: 'mornings',
  order: 3,
  left: { label: 'SUNRISE SUMMIT', line: 'Up at 3, on top by 6', tags: ['early_starts', 'hiking'] },
  right: {
    label: 'SLEEP TILL TEN',
    line: 'Breakfast is a lifestyle',
    tags: ['late_starts', 'easy_pace'],
  },
  chip: 'Mornings',
};

const side = z.object({
  label: z.string(),
  line: z.string(),
  tags: z.array(z.enum(TASTE_TAGS)).min(1).max(3),
});
const outputSchema = z.object({
  questions: z
    .array(z.object({ id: z.string(), left: side, right: side, chip: z.string() }))
    .length(5),
});

const sideJson = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    line: { type: 'string' },
    tags: { type: 'array', items: { type: 'string', enum: [...TASTE_TAGS] } },
  },
  required: ['label', 'line', 'tags'],
  additionalProperties: false,
};

export const tasteQuizKind: KindModule<'taste_quiz'> = {
  kind: 'taste_quiz',
  title: () => 'Taste quiz',
  gate: 'owner_approval',
  brief: () => Promise.resolve({ units: [{ id: 'quiz', input: { designed: DESIGNED_QUESTION } }] }),
  prompt: (_unit, brief) => ({
    system: `You write a playful this-or-that travel taste quiz. Each question has two cards: a label in capitals (at most 16 characters) and a line (at most 28 characters), each mapped to 1-3 taste tags. Tone: dry, warm, a little cheeky, like "Tap one. There are no wrong answers, only late ones." Cover food, pace, evenings, nature versus city, and spending. Reply with JSON only.`,
    user: `The designed question (already in the quiz, do not repeat it): ${JSON.stringify(DESIGNED_QUESTION)}.
${brief.notes?.['*'] ? `Reviewer notes: ${brief.notes['*']}\n` : ''}Write the other 5 questions as {"questions": [{"id" (kebab-case topic), "left", "right", "chip" (at most 16 characters, for the retake chips)}]}.`,
    schema: outputSchema,
    jsonSchema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              left: sideJson,
              right: sideJson,
              chip: { type: 'string' },
            },
            required: ['id', 'left', 'right', 'chip'],
            additionalProperties: false,
          },
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  }),
  assemble: (_ctx, _brief, outputs) => {
    const output = outputs.get('quiz') as z.infer<typeof outputSchema> | undefined;
    if (output === undefined) return Promise.resolve([]);
    const orders = [1, 2, 4, 5, 6];
    const generated = output.questions.map((q, i) =>
      quizQuestionItemSchema.parse({ ...q, order: orders[i], chip: q.chip.slice(0, 24) }),
    );
    return Promise.resolve([...generated.slice(0, 2), DESIGNED_QUESTION, ...generated.slice(2)]);
  },
  validators: {
    items: [
      {
        id: 'designed-question',
        severity: 'fail',
        check: (q) =>
          q.order === 3 && JSON.stringify(q) !== JSON.stringify(DESIGNED_QUESTION)
            ? ['question 3 is the designed one']
            : [],
      },
      {
        id: 'card-length',
        severity: 'warn',
        check: (q) =>
          [q.left, q.right].flatMap((s) =>
            s.label.length > 16 || s.line.length > 28 ? [`"${s.label}" may not fit its card`] : [],
          ),
      },
    ],
    batch: [
      {
        id: 'six-questions',
        severity: 'fail',
        check: ({ items }) => {
          const orders = new Set(items.map((q) => q.order));
          return items.length === QUIZ_LENGTH && orders.size === QUIZ_LENGTH
            ? []
            : [{ ref: null, message: `the quiz needs exactly ${QUIZ_LENGTH} questions in order` }];
        },
      },
    ],
  },
};

registerKind(tasteQuizKind);
