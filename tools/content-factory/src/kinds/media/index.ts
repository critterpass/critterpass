/**
 * Editorial media: licensed stock photos and short video loops per destination, searched on
 * Pexels and Pixabay, with Wikimedia Commons for named landmarks. Built without a model: the brief
 * runs the searches and every result becomes a candidate item. The owner keeps the picks in the
 * ops console (rejecting the rest); approval publishes them and the worker's ingest job stores the
 * files. `--opt subjects=da-nang,bali` limits the batch; `--opt lead=<id>,<id>` ranks those
 * candidates first, so a subject's hero is the first kept photo. `--opt places=da-nang` instead
 * proposes each curated place's own photo from Wikimedia Commons, else a labelled generic one
 * (see place-batch.ts), and renders a review page per destination (review-page.ts).
 */
import path from 'node:path';

import { mediaItemSchema, type ContentItem } from '@cp/content';

import { batchPaths, writeJson } from '../../work';
import { registerKind } from '../registry';
import type { GenerationUnit, KindContext, KindModule } from '../types';
import { PROPOSALS_FILE, renderMediaSheets } from './contact-sheet';
import { defaultHttp, type SourceHttp } from './http';
import { pexelsPhotos, pexelsVideos, type SourceCandidate } from './pexels';
import { pixabayPhotos, pixabayVideos } from './pixabay';
import { placeBatch } from './place-batch';
import { sourceAllowedFor } from './places';
import { subjectsFor, type MediaSubject } from './subjects';
import { wikimediaPhotos } from './wikimedia';

export interface MediaSearchDeps {
  readonly http: SourceHttp;
  readonly pexelsKey: string | undefined;
  readonly pixabayKey: string | undefined;
}

const PHOTOS_PER_QUERY = 6;
const VIDEOS_PER_QUERY = 4;
const LANDMARK_PHOTOS = 3;

/** Every source's results for one subject, interleaved so each source is seen near the top. */
export async function searchSubject(
  subject: MediaSubject,
  deps: MediaSearchDeps,
): Promise<SourceCandidate[]> {
  const lists: SourceCandidate[][] = [];
  for (const query of subject.photos) {
    if (deps.pexelsKey)
      lists.push(await pexelsPhotos(deps.http, deps.pexelsKey, query, PHOTOS_PER_QUERY));
    if (deps.pixabayKey)
      lists.push(await pixabayPhotos(deps.http, deps.pixabayKey, query, PHOTOS_PER_QUERY));
  }
  for (const landmark of subject.landmarks) {
    lists.push(await wikimediaPhotos(deps.http, landmark, LANDMARK_PHOTOS));
  }
  for (const query of subject.videos) {
    if (deps.pexelsKey)
      lists.push(await pexelsVideos(deps.http, deps.pexelsKey, query, VIDEOS_PER_QUERY));
    if (deps.pixabayKey)
      lists.push(await pixabayVideos(deps.http, deps.pixabayKey, query, VIDEOS_PER_QUERY));
  }
  const merged: SourceCandidate[] = [];
  const seen = new Set<string>();
  for (let i = 0; lists.some((list) => i < list.length); i += 1) {
    for (const list of lists) {
      const candidate = list[i];
      if (candidate === undefined || seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      merged.push(candidate);
    }
  }
  return merged;
}

/** Candidates for every subject, ranked per subject with the `lead` ids first. */
export async function mediaCandidates(
  subjects: readonly MediaSubject[],
  deps: MediaSearchDeps,
  lead: readonly string[] = [],
): Promise<ContentItem<'media'>[]> {
  const byId = new Map<string, ContentItem<'media'>>();
  for (const subject of subjects) {
    const found = await searchSubject(subject, deps);
    const ordered = [
      ...lead.flatMap((id) => found.filter((c) => c.id === id)),
      ...found.filter((c) => !lead.includes(c.id)),
    ];
    for (const [rank, candidate] of ordered.slice(0, 100).entries()) {
      const existing = byId.get(candidate.id);
      if (existing !== undefined) {
        byId.set(candidate.id, { ...existing, subjects: [...existing.subjects, subject.key] });
        continue;
      }
      byId.set(
        candidate.id,
        mediaItemSchema.parse({ ...candidate, subjects: [subject.key], rank }),
      );
    }
  }
  return [...byId.values()];
}

function depsFromEnv(): MediaSearchDeps {
  return {
    http: defaultHttp(),
    pexelsKey: process.env['PEXELS_API_KEY'] || undefined,
    pixabayKey: process.env['PIXABAY_API_KEY'] || undefined,
  };
}

const listOption = (ctx: KindContext, name: string) =>
  (ctx.options[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const mediaKind: KindModule<'media'> = {
  kind: 'media',
  title: (ctx) =>
    ctx.options['places'] === undefined
      ? `Media · ${ctx.options['subjects'] ?? 'every destination'}`
      : `Media · places in ${ctx.options['places']}`,
  gate: 'owner_approval',
  async brief(ctx) {
    const deps = depsFromEnv();
    if (ctx.options['places'] !== undefined) {
      const batch = await placeBatch(deps.http, deps, ctx.options, (name) => listOption(ctx, name));
      writeJson(path.join(batchPaths('media', ctx.batchKey).dir, PROPOSALS_FILE), {
        proposals: batch.proposals,
        unanswered: batch.unanswered,
        suggestedDrops: batch.suggestedDrops,
      });
      const units = batch.items.map((item) => ({ id: item.id, input: item }));
      return { units, carried: batch.carried, options: ctx.options };
    }
    if (deps.pexelsKey === undefined && deps.pixabayKey === undefined) {
      throw new Error('media search needs PEXELS_API_KEY or PIXABAY_API_KEY');
    }
    const items = await mediaCandidates(
      subjectsFor(ctx.options['subjects']),
      deps,
      listOption(ctx, 'lead'),
    );
    const units: GenerationUnit[] = items.map((item) => ({ id: item.id, input: item }));
    return { units, options: ctx.options };
  },
  assemble: (_ctx, brief) =>
    Promise.resolve([
      ...brief.units.map((unit) => mediaItemSchema.parse(unit.input)),
      ...(brief.carried ?? []).map((item) => mediaItemSchema.parse(item)),
    ]),
  validators: {
    items: [
      {
        id: 'only-its-own-photo-for-a-place',
        severity: 'fail',
        check: (item) =>
          item.subjects
            .filter((subject) => !sourceAllowedFor(item.source, subject, item.title))
            .map(
              (subject) => `${item.source} is stock: only a labelled generic photo of ${subject}`,
            ),
      },
      {
        id: 'resolution',
        severity: 'fail',
        check: (item) =>
          Math.max(item.width, item.height) < 1200
            ? [`${item.width}×${item.height} is too small for a full-width hero`]
            : [],
      },
      {
        id: 'landscape',
        severity: 'warn',
        check: (item) => (item.height > item.width ? ['portrait: crops hard in a hero band'] : []),
      },
      {
        id: 'loop-length',
        severity: 'warn',
        check: (item) =>
          item.duration_ms !== null && item.duration_ms < 6000
            ? ['shorter than 6 s: the loop repeats quickly']
            : [],
      },
    ],
    batch: [
      {
        id: 'keeps-the-destination-media',
        severity: 'fail',
        check: ({ items }) => {
          const subjects = items.flatMap((i) => i.subjects);
          return subjects.some((s) => s.startsWith('poi:')) &&
            !subjects.some((s) => s.startsWith('destination:'))
            ? [
                {
                  ref: null,
                  message:
                    'publishing replaces every media asset: carry the live destination media',
                },
              ]
            : [];
        },
      },
      {
        id: 'every-subject-has-a-photo',
        severity: 'warn',
        check: ({ items }) => {
          const covered = new Set(
            items.filter((i) => i.kind === 'photo').flatMap((i) => i.subjects),
          );
          return [...new Set(items.flatMap((i) => i.subjects))]
            .filter((s) => !covered.has(s))
            .map((s) => ({ ref: null, message: `${s} has no photo candidate` }));
        },
      },
    ],
  },
  render: (ctx, items, outDir) => renderMediaSheets(items, outDir, fetch, ctx.batchKey),
};

registerKind(mediaKind);
