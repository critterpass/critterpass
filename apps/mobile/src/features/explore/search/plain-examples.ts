import { t } from '@lingui/core/macro';

/**
 * The trip's three examples: dinner near the stay (without "near the stay" while the trip has no
 * stay to measure from), a sight on a free day, a rainy-day question.
 */
export function plainExamples(input: {
  readonly destination: string;
  readonly freeWeekday: string | null;
  readonly stay: boolean;
}): string[] {
  const destination = input.destination;
  const day = input.freeWeekday ?? t({ id: 'search.examples.saturday', message: 'Saturday' });
  return [
    input.stay
      ? t({
          id: 'search.examples.dinner',
          message: 'somewhere quiet for dinner near the stay, open late',
        })
      : t({
          id: 'search.examples.dinnerNoStay',
          message: 'somewhere quiet for dinner, open late',
        }),
    t({ id: 'search.examples.crowds', message: `a waterfall without the crowds, on ${day}` }),
    t({
      id: 'search.examples.rain',
      message: `what to do in ${destination} when it rains`,
    }),
  ];
}
