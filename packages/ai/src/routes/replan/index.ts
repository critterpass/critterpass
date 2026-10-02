/**
 * The weather replan's words (route `replan.weather`, pro tier, 3e-2 banner and 3e-3 review): a
 * headline ("Rain till 15:00. Move the walk?") and the reason on the move. The planner's solver
 * chose the new time (packages/planner/src/disruption/weather-replan.ts); the guide words it with
 * the solver's times and rain chance only, and never claims the item is already moved.
 */
import type { Gateway } from '../../client';
import type { PersonaId } from '../../persona/schema';
import type { UsageContext } from '../../usage';
import { writeGroundedCopy, type CopyFacts, type CopyLimits, type CopyResult } from '../disruption';

export const REPLAN_ROUTE = 'replan.weather' as const;
export const REPLAN_PROMPT_VERSION = 'replan@1';

export const REPLAN_TASK = [
  '# Task',
  '',
  "Rain is forecast over one of the crew's outdoor plans and there is a dry slot the same day.",
  '`headline` is a short question in your voice suggesting the move (under 60 characters);',
  '`detail` one sentence on why. Word the one item as the reason shown on the move. It is a',
  'suggestion the crew can accept or ignore: never say it has been moved.',
].join('\n');

export const REPLAN_LIMITS: CopyLimits = {
  headlineMax: 70,
  detailMax: 160,
  itemMax: 140,
  claims: [
    { word: 'moved it', allowedWhen: () => false },
    { word: "i've moved", allowedWhen: () => false },
    { word: 'booked', allowedWhen: () => false },
  ],
};

export function replanCopyInput(facts: CopyFacts): {
  facts: CopyFacts;
  headlineTemplate: string;
  detailTemplate: string;
  items: { id: string; kind: string; facts: CopyFacts; template: string }[];
} {
  const title = String(facts['title']);
  return {
    facts,
    headlineTemplate: `Rain till ${String(facts['rain_until'])}. Move ${title}?`,
    detailTemplate: `${String(facts['rain_pct'])}% chance of rain at ${String(facts['from'])}; it looks dry at ${String(facts['to'])}.`,
    items: [
      {
        id: 'move',
        kind: 'retime_item',
        facts,
        template: `${title} ${String(facts['from'])} → ${String(facts['to'])}, out of the rain`,
      },
    ],
  };
}

export function writeReplanCopy(
  gateway: Pick<Gateway, 'callModel'> | undefined,
  guide: PersonaId,
  facts: CopyFacts,
  context: UsageContext = {},
): Promise<CopyResult> {
  return writeGroundedCopy(
    gateway,
    {
      route: REPLAN_ROUTE,
      guide,
      task: REPLAN_TASK,
      question: 'Word the suggestion.',
      input: replanCopyInput(facts),
      limits: REPLAN_LIMITS,
    },
    context,
  );
}
