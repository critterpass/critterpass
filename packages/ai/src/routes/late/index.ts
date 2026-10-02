/**
 * Running late's words (route `late.options`, fast tier, 3k-9): the guide's one line about why the
 * party is late and what it suggests, and one line per option the planner offered. The options,
 * times and amounts are the planner's (packages/planner/src/disruption/late-options.ts). The guide
 * never names a closure or a procession unless a cited source did, never says whoever runs the
 * place agreed before they did, and never promises a refund the booking does not show.
 */
import type { Gateway } from '../../client';
import type { PersonaId } from '../../persona/schema';
import type { UsageContext } from '../../usage';
import {
  writeGroundedCopy,
  type CopyFacts,
  type CopyInput,
  type CopyLimits,
  type CopyResult,
} from '../disruption';

export const LATE_ROUTE = 'late.options' as const;
export const LATE_PROMPT_VERSION = 'late@1';

export const LATE_TASK = [
  '# Task',
  '',
  'Some of the crew are running late for something on the plan. Word the running-late sheet:',
  '`headline` is the fact in a few words (who or what, and how many minutes); `detail` is one',
  'short sentence in your voice (25 words at most) about why they are late and what you would',
  'do. Each item is one option they can pick: one short plain line saying what happens if they',
  'pick it. Talk to the late ones as "you". If the facts give no reason for the delay, say',
  'traffic is heavy and nothing more specific.',
].join('\n');

const sourced = (facts: CopyFacts): boolean => typeof facts['source'] === 'string';
const agreed = (facts: CopyFacts): boolean => facts['vendor_status'] === 'confirmed';

export const LATE_LIMITS: CopyLimits = {
  headlineMax: 60,
  detailMax: 180,
  itemMax: 120,
  claims: [
    { word: 'closed', allowedWhen: sourced },
    { word: 'closure', allowedWhen: sourced },
    { word: 'procession', allowedWhen: sourced },
    { word: 'accident', allowedWhen: sourced },
    { word: 'said yes', allowedWhen: agreed },
    { word: 'confirmed', allowedWhen: agreed },
    { word: 'refund', allowedWhen: (facts) => facts['refund'] !== undefined },
    { word: 'guaranteed', allowedWhen: () => false },
  ],
};

export function writeLateCopy(
  gateway: Pick<Gateway, 'callModel'> | undefined,
  guide: PersonaId,
  input: CopyInput,
  context: UsageContext = {},
): Promise<CopyResult> {
  return writeGroundedCopy(
    gateway,
    {
      route: LATE_ROUTE,
      guide,
      task: LATE_TASK,
      question: 'Word the running-late sheet.',
      input,
      limits: LATE_LIMITS,
    },
    context,
  );
}
