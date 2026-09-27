/**
 * A minimal content kind for exercising the pipeline itself: one generated this-or-that question
 * per unit. `failing` adds a validator that rejects every item.
 */
import { quizQuestionItemSchema, TASTE_TAGS, type ContentKind } from '@cp/content';
import { z } from 'zod';

import type { KindModule } from '../src/kinds/types';

const sideSchema = z.object({
  label: z.string(),
  line: z.string(),
  tags: z.array(z.enum(TASTE_TAGS)).min(1).max(3),
});
const outputSchema = z.object({ left: sideSchema, right: sideSchema, chip: z.string() });

const jsonSide = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    line: { type: 'string' },
    tags: { type: 'array', items: { type: 'string', enum: [...TASTE_TAGS] } },
  },
  required: ['label', 'line', 'tags'],
  additionalProperties: false,
};

export function quizKind(options: { failing?: boolean } = {}): KindModule<'taste_quiz'> {
  return {
    kind: 'taste_quiz' satisfies ContentKind,
    title: () => 'Pipeline check',
    gate: 'owner_approval',
    brief: () => Promise.resolve({ units: [{ id: 'mornings', input: { topic: 'mornings' } }] }),
    prompt: (unit) => ({
      system: 'You write playful this-or-that travel questions. Reply with JSON only.',
      user: `Write one question about ${String((unit.input as { topic: string }).topic)}: two sides, each a label of at most 16 characters in capitals, a line of at most 30 characters and 1-2 tags, plus a chip of at most 16 characters.`,
      schema: outputSchema,
      jsonSchema: {
        type: 'object',
        properties: { left: jsonSide, right: jsonSide, chip: { type: 'string' } },
        required: ['left', 'right', 'chip'],
        additionalProperties: false,
      },
    }),
    assemble: (_ctx, brief, outputs) =>
      Promise.resolve(
        brief.units.flatMap((unit, index) => {
          const output = outputs.get(unit.id);
          return output === undefined
            ? []
            : [
                quizQuestionItemSchema.parse({
                  id: unit.id,
                  order: index + 1,
                  ...(output as object),
                }),
              ];
        }),
      ),
    validators: {
      items: options.failing
        ? [{ id: 'always', severity: 'fail', check: () => ['rejected by the test'] }]
        : [],
      batch: [],
    },
  };
}
