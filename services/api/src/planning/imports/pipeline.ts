/**
 * One Add from a link import, as the events the phone ticks places in from
 * (docs/api-contracts-planning.md, imports): `source` first, saying truthfully what was read, then
 * one `match`, `ambiguous` or `unknown` per mention in the post's order, then `done` with the
 * counts; or `error` when nothing could be read. A post about another city answers `source` then
 * `done` with zeros. Post text, titles and OCR lines live only in this request: nothing is written.
 */
import {
  extractPlaceMentions,
  extractPlaceMentionsFromMedia,
  type Gateway,
  type GeminiVision,
  type LinkExtractResult,
  type LinkSource,
} from '@cp/ai';
import { withUser } from '@cp/db';
import type { ImportEvent, ImportRequest } from '@cp/domain';
import { readLink, type LinkReaderDeps, type MapPlace } from '@cp/suppliers';
import type pg from 'pg';

import { fitForTrip, type FitDeps } from '../fit/service';
import { areaFromAddress } from '../search/area';
import { matchMention, type MatchCandidate, type MatchOutcome, type Mention } from './match';

export interface ImportDeps {
  readonly pool: pg.Pool;
  readonly gateway: Pick<Gateway, 'callModel'> | undefined;
  /** The Gemini fallback; undefined unless a key is set (it still checks `ai.gemini_vision`). */
  readonly gemini: GeminiVision | undefined;
  readonly readers: Omit<LinkReaderDeps, 'platforms'>;
  readonly fit: FitDeps;
}

export interface ImportJob {
  readonly uid: string;
  readonly tripId: string;
  readonly crewId: string;
  readonly destinationId: string;
  readonly destination: string;
  readonly areas: readonly string[];
  readonly platforms: LinkReaderDeps['platforms'];
  readonly request: ImportRequest;
}

type SourceData = Extract<ImportEvent, { event: 'source' }>['data'];
type ImportErrorCode = Extract<ImportEvent, { event: 'error' }>['data']['code'];
type Read = { source: SourceData; mentions: readonly Mention[] } | { error: ImportErrorCode };

const mapMention = (place: MapPlace): Mention => ({
  label: place.name ?? 'Pinned place',
  kindHint: null,
  areaHint: null,
  point: place.point,
});

/** Mentions to match; a post about another city has none, a failed call is `busy`. */
function mentionsOf(result: LinkExtractResult): readonly Mention[] | 'busy' {
  if (result.status === 'other_destination') return [];
  if (result.status === 'none') return result.reason === 'call_failed' ? 'busy' : [];
  return result.mentions.map((mention) => ({
    label: mention.label,
    kindHint: mention.kind_hint,
    areaHint: mention.area_hint ?? null,
    point: null,
  }));
}

async function readSource(job: ImportJob, deps: ImportDeps): Promise<Read> {
  const usage = { userId: job.uid, crewId: job.crewId, tripId: job.tripId };
  const input = { destination: job.destination, areas: job.areas };
  const extract = async (source: LinkSource) =>
    deps.gateway === undefined
      ? 'busy'
      : mentionsOf(await extractPlaceMentions(deps.gateway, { ...input, source }, { usage }));
  if ('text' in job.request) {
    const lines = job.request.text.split('\n').filter((line) => line.trim() !== '');
    const found = await extract({ kind: 'screenshot', lines });
    return found === 'busy'
      ? { error: 'busy' }
      : { source: { platform: 'screenshot', read: 'ocr_text' }, mentions: found };
  }
  const read = await readLink(job.request.url, { ...deps.readers, platforms: job.platforms });
  if (read.kind === 'unsupported' || read.kind === 'needs_screenshot') {
    return { error: 'unsupported_link' };
  }
  if (read.kind === 'unreadable') {
    return { error: read.reason === 'not_found' ? 'unreadable' : 'busy' };
  }
  if (read.kind === 'map') {
    return {
      source: { platform: read.platform, read: 'map_link', title: read.place.name },
      mentions: [mapMention(read.place)],
    };
  }
  const { post } = read;
  const sourceOf = (what: 'post_text' | 'video'): SourceData => ({
    platform: post.platform,
    read: what,
    title: post.title,
    author: post.author,
    thumb_url: post.thumbUrl,
  });
  const found = await extract({
    kind: 'post',
    platform: post.platform,
    url: post.url,
    // TikTok's title is its caption: given once, as the text.
    title: post.platform === 'tiktok' ? null : post.title,
    text: post.text,
    author: post.author,
  });
  if (found !== 'busy' && found.length > 0) {
    return { source: sourceOf('post_text'), mentions: found };
  }
  // Only a video with nothing read from its text goes to Gemini, which checks its own switch.
  if (post.platform === 'youtube' && deps.gemini !== undefined) {
    const watched = mentionsOf(
      await extractPlaceMentionsFromMedia(
        deps.gemini,
        { ...input, media: { kind: 'video', url: post.url } },
        { usage },
      ),
    );
    if (watched !== 'busy' && watched.length > 0) {
      return { source: sourceOf('video'), mentions: watched };
    }
  }
  return found === 'busy' ? { error: 'busy' } : { source: sourceOf('post_text'), mentions: [] };
}

function candidateOut(
  candidate: MatchCandidate,
  destination: string,
  fits: ReadonlyMap<string, { day_no: number; grade: 'good' | 'possible' | 'no' } | null>,
) {
  const meta = areaFromAddress(candidate.address, destination) ?? candidate.address;
  return {
    poi_id: candidate.poiId,
    name: candidate.name.slice(0, 120),
    category: candidate.category,
    meta: meta === null ? null : meta.slice(0, 120),
    ...(fits.has(candidate.poiId) ? { fit_best: fits.get(candidate.poiId) ?? null } : {}),
  };
}

export async function* runImport(job: ImportJob, deps: ImportDeps): AsyncGenerator<ImportEvent> {
  const read = await readSource(job, deps).catch((): Read => ({ error: 'busy' }));
  if ('error' in read) {
    yield { event: 'error', data: { code: read.error } };
    return;
  }
  yield { event: 'source', data: read.source };
  const { outcomes, fits } = await withUser(deps.pool, job.uid, 'unknown', async (tx) => {
    const matched: MatchOutcome[] = [];
    for (const mention of read.mentions) {
      matched.push(await matchMention(tx, job.destinationId, mention));
    }
    const ids = [
      ...new Set(
        matched.flatMap((outcome) =>
          outcome.kind === 'sure'
            ? [outcome.candidate.poiId]
            : outcome.kind === 'ambiguous'
              ? outcome.candidates.map((candidate) => candidate.poiId)
              : [],
        ),
      ),
    ].slice(0, 50);
    const best = new Map<string, { day_no: number; grade: 'good' | 'possible' | 'no' } | null>();
    if (ids.length > 0) {
      try {
        const { fits: all } = await fitForTrip(tx, { tripId: job.tripId, poiIds: ids }, deps.fit);
        for (const fit of all) {
          if (fit.poi_id === null) continue;
          best.set(
            fit.poi_id,
            fit.best === null ? null : { day_no: fit.best.day_no, grade: fit.best.grade },
          );
        }
      } catch {
        // Fit is a nicety on a match; a plan it cannot read leaves it out.
      }
    }
    return { outcomes: matched, fits: best };
  });
  const counts = { matched: 0, ambiguous: 0, unknown: 0 };
  for (const [index, outcome] of outcomes.entries()) {
    const label = (read.mentions[index]?.label ?? '').slice(0, 120) || 'Place';
    if (outcome.kind === 'sure') {
      counts.matched += 1;
      yield {
        event: 'match',
        data: { label, ...candidateOut(outcome.candidate, job.destination, fits) },
      };
    } else if (outcome.kind === 'ambiguous') {
      counts.ambiguous += 1;
      const candidates = outcome.candidates.map((c) => candidateOut(c, job.destination, fits));
      yield { event: 'ambiguous', data: { label, candidates } };
    } else {
      counts.unknown += 1;
      yield { event: 'unknown', data: { label } };
    }
  }
  yield { event: 'done', data: counts };
}
