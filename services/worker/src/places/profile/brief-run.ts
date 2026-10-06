/**
 * One destination's brief run (`places.destination_brief`): the searches and our own fetch of the
 * top pages, one structured write (pro tier) that names the essentials, eateries and stay prices
 * with a quote from a cited page each, cite-or-drop, then the names matched to our rows (close
 * calls to Jev; a name no row carries is dropped). The essentials and eateries lead the
 * destination's picks and the open-data fill tops up the kinds they lack (`pick/select.ts`); the
 * stay bands also go to the cost indices as web estimates. A curated destination, an editorial
 * brief, a brief still fresh (unless forced) or a spent daily cap ends the run before any call.
 */
import {
  buildDestinationBriefRequest,
  checkDestinationBriefReply,
  DESTINATION_BRIEF_ROUTE,
  isDeclined,
  MODEL_IDS,
  parseStructuredText,
  textOf,
  type DecisionClient,
  type Gateway,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import { profileSourceLocales } from '@cp/domain';
import type pg from 'pg';

import { loadFill, writePicks } from '../pick/run';
import { PICK_TARGET, rankPicks } from '../pick/select';
import { briefDestination, gatherBriefPages } from './brief-evidence';
import { matchBriefLeads } from './brief-match';
import {
  briefSpentTodayMicros,
  loadBriefTarget,
  markBriefEnded,
  markBriefStarted,
  saveBrief,
  saveStayEstimates,
  type BriefTarget,
} from './brief-store';
import type { PlaceSearch } from './search';

export interface DestinationBriefDeps {
  readonly gateway: Pick<Gateway, 'callModel'>;
  readonly decisions: Pick<DecisionClient, 'decide'>;
  readonly search: PlaceSearch;
  readonly dailyCapMicros: number;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

export interface DestinationBriefInput {
  readonly destinationId: string;
  readonly force?: boolean;
  readonly signal?: AbortSignal;
  readonly jobId?: string;
}

export type DestinationBriefReport =
  | { readonly outcome: 'skipped'; readonly reason: string }
  | { readonly outcome: 'declined'; readonly reason: string; readonly costMicros: number }
  | {
      readonly outcome: 'ready';
      readonly essentials: number;
      readonly eateries: number;
      readonly stays: number;
      readonly dropped: number;
      readonly picks: number;
      readonly costMicros: number;
      readonly seconds: number;
    };

const FILL_OVERSAMPLE = 3;

/** Why a run would not start, or null when it should. */
export function briefSkipReason(
  target: BriefTarget | null,
  force: boolean,
  spentMicros: number,
  capMicros: number,
  now: Date,
): string | null {
  if (target === null) return 'missing';
  if (target.origin === 'editorial') return 'reviewed';
  if (target.curated) return 'curated';
  const fresh = target.expiresAt !== null && target.expiresAt > now;
  if (!force && target.status === 'ready' && fresh) return 'exists';
  if (spentMicros >= capMicros) return 'daily_cap';
  return null;
}

const seconds = (from: number) => Math.round((performance.now() - from) / 100) / 10;

export async function runDestinationBrief(
  pool: pg.Pool,
  deps: DestinationBriefDeps,
  input: DestinationBriefInput,
): Promise<DestinationBriefReport> {
  const now = deps.now ?? (() => new Date());
  const target = await loadBriefTarget(pool, input.destinationId);
  const skip = briefSkipReason(
    target,
    input.force === true,
    target === null ? 0 : await briefSpentTodayMicros(pool, now()),
    deps.dailyCapMicros,
    now(),
  );
  if (skip !== null || target === null) return { outcome: 'skipped', reason: skip ?? 'missing' };

  await markBriefStarted(pool, target.id, now());
  const started = performance.now();
  const usage = input.jobId === undefined ? {} : { jobId: input.jobId };
  const signal = input.signal;
  const locales = profileSourceLocales(target.country);
  const model = MODEL_IDS.pro;
  const end = async (reason: string, costMicros: number): Promise<DestinationBriefReport> => {
    await markBriefEnded(pool, target.id, { status: 'declined', error: reason, model, costMicros });
    return { outcome: 'declined', reason, costMicros };
  };

  const pages = await gatherBriefPages(target, deps, signal);
  const searchSeconds = seconds(started);
  if (pages.length === 0) return end('no_pages', 0);
  const write = await deps.gateway.callModel(
    DESTINATION_BRIEF_ROUTE,
    {
      ...buildDestinationBriefRequest(
        briefDestination(target.name, target.country),
        pages,
        locales,
      ),
      ...(signal === undefined ? {} : { signal }),
    },
    usage,
  );
  const raw = isDeclined(write.message)
    ? { decision: 'decline' }
    : parseStructuredText(textOf(write.message));
  const checked = checkDestinationBriefReply(raw, pages, locales);
  if (checked.decision !== 'write') {
    return end(checked.decision === 'decline' ? 'declined' : 'unreadable', write.costMicros);
  }
  const leads = [...checked.essentials, ...checked.eateries];
  const matches = await matchBriefLeads(pool, target, leads, deps.decisions, usage);
  const rowOf = new Map(matches.matched.map((m) => [m.lead, m.row]));
  const essentials = checked.essentials.flatMap((lead) => {
    const row = rowOf.get(lead);
    return row === undefined ? [] : [{ lead, row }];
  });
  const eateries = checked.eateries.flatMap((lead) => {
    const row = rowOf.get(lead);
    return row === undefined ? [] : [{ lead, row }];
  });
  const costMicros = write.costMicros + matches.costMicros;
  if (essentials.length === 0) return end('no_rows', costMicros);

  const sourceOf = (lead: (typeof leads)[number]) => [lead.source];
  const report = await withSystem(pool, async (tx) => {
    const fill = await loadFill(tx, target.id, PICK_TARGET * FILL_OVERSAMPLE);
    const picks = rankPicks(
      [...essentials, ...eateries].map((m) => m.row),
      fill,
    );
    await writePicks(tx, target.id, picks);
    const stays = await saveStayEstimates(tx, target.id, checked.stays, now());
    await saveBrief(
      tx,
      target.id,
      {
        essentials: essentials.map(({ lead, row }, i) => ({
          poi_id: row.id,
          rank: i + 1,
          why: lead.why,
          sources: sourceOf(lead),
        })),
        eateries: eateries.map(({ lead, row }) => ({
          poi_id: row.id,
          dish: lead.dish,
          why: lead.why,
          sources: sourceOf(lead),
        })),
        stays: checked.stays,
        dropped: [...checked.dropped, ...matches.dropped.map((d) => ({ section: 'match', ...d }))],
        model,
        costMicros,
        timings: { search_s: searchSeconds, total_s: seconds(started) },
      },
      now(),
    );
    return { picks: picks.length, stays };
  });
  return {
    outcome: 'ready',
    essentials: essentials.length,
    eateries: eateries.length,
    stays: checked.stays.length,
    dropped: checked.dropped.length + matches.dropped.length,
    picks: report.picks,
    costMicros,
    seconds: seconds(started),
  };
}
