/**
 * The flight disruption's words (route `disruption.plan_b`, pro tier, 3k-5): the hero title, the
 * guide line and one label per row the planner classified. Rows, times and who decides come from
 * code (packages/planner/src/disruption); a vendor row may say "confirmed" only once the vendor
 * did, and a flight is never "rebooked" by us.
 */
import type { Gateway } from '../../client';
import type { PersonaId } from '../../persona/schema';
import type { UsageContext } from '../../usage';
import { writeGroundedCopy } from './prompt';
import type { CopyFacts, CopyInput, CopyLimits, CopyResult } from './schema';

export * from './prompt';
export * from './schema';
export * from './validate';

export const DISRUPTION_ROUTE = 'disruption.plan_b' as const;
export const DISRUPTION_PROMPT_VERSION = 'disruption@1';

const TASK = [
  '# Task',
  '',
  "A flight in the crew's trip changed. Word the disruption screen: a short headline (the hero,",
  'a few words), one detail line in your voice that says what it means for the crew, and a label',
  'for each row. Rows in state `done` already happened; `needs_yes` rows are questions to the',
  'crew; `draft_ready` rows are messages you drafted and nobody has sent; `link` rows are things',
  'only the traveller can do. Talk to the crew as "you".',
].join('\n');

const confirmed = (facts: CopyFacts): boolean => facts['vendor_status'] === 'confirmed';

export const DISRUPTION_LIMITS: CopyLimits = {
  headlineMax: 60,
  detailMax: 200,
  itemMax: 120,
  claims: [
    { word: 'confirmed', allowedWhen: confirmed },
    { word: 'rebooked', allowedWhen: () => false },
    { word: 'booked', allowedWhen: () => false },
    { word: 'refund', allowedWhen: (facts) => facts['refund'] !== undefined },
  ],
};

export async function writeDisruptionCopy(
  gateway: Pick<Gateway, 'callModel'> | undefined,
  guide: PersonaId,
  input: CopyInput,
  context: UsageContext = {},
): Promise<CopyResult> {
  return writeGroundedCopy(
    gateway,
    {
      route: DISRUPTION_ROUTE,
      guide,
      task: TASK,
      question: 'Word the disruption screen.',
      input,
      limits: DISRUPTION_LIMITS,
    },
    context,
  );
}
