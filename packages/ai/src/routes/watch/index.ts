/**
 * The forecast watch list's words (route `watch.copy`, fast tier, 3k-7): the guide line at the top
 * and, for each watch row whose status or numbers changed, its title and detail. Scoring is the
 * planner's (packages/planner/src/disruption/watch-rules.ts); the guide only words it, with the
 * numbers the rules read, and never says a harbour closed or a trip is cancelled unless a cited
 * source says so. Rows it leaves out keep their template.
 */
import type { Gateway } from '../../client';
import type { PersonaId } from '../../persona/schema';
import type { UsageContext } from '../../usage';
import { writeGroundedCopy, type CopyFacts, type CopyLimits, type CopyResult } from '../disruption';

export const WATCH_ROUTE = 'watch.copy' as const;
export const WATCH_PROMPT_VERSION = 'watch@1';

export const WATCH_TASK = [
  '# Task',
  '',
  "Word the crew's forecast watch list. `headline` is one line in your voice about what matters",
  'most this week; `detail` may be empty. Each item is one row: ids ending `:title` are short',
  'titles (a few words and the key number), ids ending `:detail` one plain sentence. PLAN B rows',
  'threaten the plan, WATCHING rows might, GO rows are fine. Never make a risk sound bigger or',
  'smaller than its status.',
].join('\n');

const sourced = (facts: CopyFacts): boolean => typeof facts['source'] === 'string';

export const WATCH_LIMITS: CopyLimits = {
  headlineMax: 90,
  detailMax: 160,
  itemMax: 140,
  claims: [
    { word: 'closed', allowedWhen: sourced },
    { word: 'cancelled', allowedWhen: sourced },
    { word: 'guaranteed', allowedWhen: () => false },
  ],
};

export interface WatchCopyRow {
  readonly id: string;
  readonly status: string;
  readonly facts: CopyFacts;
  readonly title: string;
  readonly detail: string;
}

export interface WatchCopy {
  readonly headline: string;
  readonly rows: Readonly<Record<string, { title: string; detail: string }>>;
  readonly fallbackUsed: boolean;
}

export async function writeWatchCopy(
  gateway: Pick<Gateway, 'callModel'> | undefined,
  guide: PersonaId,
  input: { readonly headline: string; readonly rows: readonly WatchCopyRow[] },
  context: UsageContext = {},
): Promise<WatchCopy> {
  const result: CopyResult = await writeGroundedCopy(
    gateway,
    {
      route: WATCH_ROUTE,
      guide,
      task: WATCH_TASK,
      question: 'Word the watch list.',
      input: {
        facts: {},
        headlineTemplate: input.headline,
        detailTemplate: '',
        items: input.rows.flatMap((row) => [
          { id: `${row.id}:title`, kind: row.status, facts: row.facts, template: row.title },
          { id: `${row.id}:detail`, kind: row.status, facts: row.facts, template: row.detail },
        ]),
      },
      limits: WATCH_LIMITS,
    },
    context,
  );
  const rows = Object.fromEntries(
    input.rows.map((row) => [
      row.id,
      {
        title: result.lines[`${row.id}:title`] ?? row.title,
        detail: result.lines[`${row.id}:detail`] ?? row.detail,
      },
    ]),
  );
  return { headline: result.headline, rows, fallbackUsed: result.fallbackUsed };
}
