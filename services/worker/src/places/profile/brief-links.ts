/**
 * A destination's links run, the second step of `places.destination_brief`: the searches for its
 * day trips and onward cities, our own fetch of the top pages, one structured write that names
 * each place with how long the journey takes, how it is made and what it costs, every figure
 * with a quote from a cited page (cite-or-drop, D30), then each name resolved to a destination
 * row. It runs for a curated city too: its places are reviewed, its links are still estimates.
 * A day-trip area itself, links still fresh (unless forced) or a spent daily cap ends the run
 * before any call.
 */
import {
  buildDestinationLinksRequest,
  checkDestinationLinksReply,
  DESTINATION_BRIEF_ROUTE,
  isDeclined,
  MODEL_IDS,
  parseStructuredText,
  textOf,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import { profileSourceLocales } from '@cp/domain';
import type pg from 'pg';

import { briefDestination, gatherPages, linkQueries } from './brief-evidence';
import {
  loadLinksTarget,
  markLinksEnded,
  markLinksStarted,
  resolveLinkEnd,
  saveLinks,
  type LinksTarget,
  type ResolvedLink,
} from './brief-links-store';
import type { DestinationBriefDeps, DestinationBriefInput } from './brief-run';
import { briefSpentTodayMicros } from './brief-store';

export type DestinationLinksReport =
  | { readonly outcome: 'skipped'; readonly reason: string }
  | { readonly outcome: 'declined'; readonly reason: string; readonly costMicros: number }
  | {
      readonly outcome: 'ready';
      readonly links: number;
      readonly dropped: number;
      readonly costMicros: number;
    };

/** Why a links run would not start, or null when it should. */
export function linksSkipReason(
  target: LinksTarget | null,
  force: boolean,
  spentMicros: number,
  capMicros: number,
  now: Date,
): string | null {
  if (target === null) return 'missing';
  if (target.coverage === 'area') return 'area';
  const fresh = target.runExpiresAt !== null && target.runExpiresAt > now;
  if (!force && target.runStatus !== null && target.runStatus !== 'failed' && fresh)
    return 'exists';
  if (spentMicros >= capMicros) return 'daily_cap';
  return null;
}

export async function runDestinationLinks(
  pool: pg.Pool,
  deps: Pick<DestinationBriefDeps, 'gateway' | 'search' | 'dailyCapMicros' | 'fetch' | 'now'>,
  input: DestinationBriefInput,
): Promise<DestinationLinksReport> {
  const now = deps.now ?? (() => new Date());
  const target = await loadLinksTarget(pool, input.destinationId);
  const skip = linksSkipReason(
    target,
    input.force === true,
    target === null ? 0 : await briefSpentTodayMicros(pool, now()),
    deps.dailyCapMicros,
    now(),
  );
  if (skip !== null || target === null) return { outcome: 'skipped', reason: skip ?? 'missing' };

  await markLinksStarted(pool, target.id, now());
  const model = MODEL_IDS.pro;
  const signal = input.signal;
  const end = async (reason: string, costMicros: number, dropped: readonly unknown[] = []) => {
    await withSystem(pool, (tx) =>
      markLinksEnded(
        tx,
        target.id,
        { status: 'declined', links: 0, dropped, error: reason, model, costMicros },
        now(),
      ),
    );
    return { outcome: 'declined' as const, reason, costMicros };
  };

  const locales = profileSourceLocales(target.country);
  const place = briefDestination(target.name, target.country);
  const pages = await gatherPages(
    linkQueries(target.name, target.country),
    [target.name],
    deps,
    signal,
  );
  if (pages.length === 0) return end('no_pages', 0);
  const write = await deps.gateway.callModel(
    DESTINATION_BRIEF_ROUTE,
    {
      ...buildDestinationLinksRequest(place, pages, locales),
      ...(signal === undefined ? {} : { signal }),
    },
    input.jobId === undefined ? {} : { jobId: input.jobId },
  );
  const raw = isDeclined(write.message)
    ? { decision: 'decline' }
    : parseStructuredText(textOf(write.message));
  const checked = checkDestinationLinksReply(raw, place, pages, locales);
  if (checked.decision !== 'write') {
    return end(checked.decision === 'decline' ? 'declined' : 'unreadable', write.costMicros);
  }
  const report = await withSystem(pool, async (tx) => {
    const dropped: unknown[] = [...checked.dropped];
    const resolved: ResolvedLink[] = [];
    for (const lead of checked.links) {
      const to = await resolveLinkEnd(tx, target, lead);
      if ('dropped' in to) {
        dropped.push({ section: 'links', name: `${lead.to} (${lead.kind})`, reason: to.dropped });
      } else if (!resolved.some((r) => r.to.id === to.id && r.lead.kind === lead.kind)) {
        resolved.push({ lead, to });
      }
    }
    if (resolved.length === 0) return { links: 0, dropped };
    await saveLinks(tx, target, resolved);
    await markLinksEnded(
      tx,
      target.id,
      {
        status: 'ready',
        links: resolved.length,
        dropped,
        error: null,
        model,
        costMicros: write.costMicros,
      },
      now(),
    );
    return { links: resolved.length, dropped };
  });
  if (report.links === 0) return end('no_links', write.costMicros, report.dropped);
  return {
    outcome: 'ready',
    links: report.links,
    dropped: report.dropped.length,
    costMicros: write.costMicros,
  };
}
