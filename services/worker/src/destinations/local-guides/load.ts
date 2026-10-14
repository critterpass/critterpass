/**
 * Loads one destination's local guides (`local_guides`) from its checked lines (`./rows.ts`). A
 * guide is keyed by its canonical profile page: a re-run updates the listed row, and a listed guide
 * the file no longer names is deleted. A guide hidden or removed on request is never touched or
 * brought back by a load. `hideGuide`, `removeGuide` and `mergeGuide` carry out requests.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

import {
  canonicalProfile,
  contactProblem,
  languageCodes,
  thirdPartyRating,
  type LocalGuideRow,
} from './rows';

export interface LocalGuidesReport {
  readonly destination: string;
  readonly status: 'loaded' | 'checked' | 'unknown_destination';
  readonly rows: number;
  readonly written: number;
  /** Lines refused by the rules, with why. */
  readonly refused: readonly { readonly name: string; readonly reason: string }[];
  /** Guides whose rating was self-reported and stored as none. */
  readonly selfRated: number;
  /** Guides left alone because they were hidden or removed on request. */
  readonly kept: number;
  readonly deleted: number;
}

interface CheckedGuide {
  readonly row: LocalGuideRow;
  readonly profileUrl: string;
}

/** The lines that pass the rules, by canonical profile (the first line of a profile wins). */
export function checkGuides(rows: readonly LocalGuideRow[]): {
  readonly guides: readonly CheckedGuide[];
  readonly refused: readonly { readonly name: string; readonly reason: string }[];
} {
  const guides = new Map<string, CheckedGuide>();
  const refused: { name: string; reason: string }[] = [];
  for (const row of rows) {
    const profile = canonicalProfile(row.profile_url);
    if ('problem' in profile) {
      refused.push({ name: row.name, reason: profile.problem });
      continue;
    }
    const contact = contactProblem(row);
    if (contact !== null) {
      refused.push({ name: row.name, reason: contact });
      continue;
    }
    if (guides.has(profile.url)) {
      refused.push({ name: row.name, reason: 'the same profile twice' });
      continue;
    }
    guides.set(profile.url, { row, profileUrl: profile.url });
  }
  return { guides: [...guides.values()], refused };
}

export async function loadLocalGuides(
  pool: pg.Pool,
  slug: string,
  rows: readonly LocalGuideRow[],
  options: { readonly dryRun: boolean },
): Promise<LocalGuidesReport> {
  const { guides, refused } = checkGuides(rows);
  const selfRated = guides.filter(
    ({ row }) => row.rating !== null && row.rating !== undefined && thirdPartyRating(row) === null,
  ).length;
  const base = { destination: slug, rows: rows.length, refused, selfRated };
  return withSystem(pool, async (tx) => {
    const destination = await tx.query<{ id: string }>(
      'SELECT id FROM destinations WHERE slug = $1',
      [slug],
    );
    const destinationId = destination.rows[0]?.id;
    if (destinationId === undefined) {
      return { ...base, status: 'unknown_destination', written: 0, kept: 0, deleted: 0 };
    }
    const { rows: closed } = await tx.query<{ profile_url: string }>(
      `SELECT profile_url FROM local_guides WHERE destination_id = $1 AND status <> 'listed'`,
      [destinationId],
    );
    const onRequest = new Set(closed.map((row) => row.profile_url));
    const open = guides.filter((guide) => !onRequest.has(guide.profileUrl));
    const kept = guides.length - open.length;
    if (options.dryRun) {
      return { ...base, status: 'checked', written: open.length, kept, deleted: 0 };
    }
    for (const { row, profileUrl } of open) await upsertGuide(tx, destinationId, row, profileUrl);
    const deleted = await tx.query(
      `DELETE FROM local_guides
        WHERE destination_id = $1 AND status = 'listed' AND profile_url <> ALL($2::text[])`,
      [destinationId, open.map((guide) => guide.profileUrl)],
    );
    return {
      ...base,
      status: 'loaded',
      written: open.length,
      kept,
      deleted: deleted.rowCount ?? 0,
    };
  });
}

async function upsertGuide(
  tx: pg.PoolClient,
  destinationId: string,
  row: LocalGuideRow,
  profileUrl: string,
): Promise<void> {
  const price = row.price ?? null;
  const rating = thirdPartyRating(row);
  await tx.query(
    `INSERT INTO local_guides AS g
            (destination_id, name, kind, languages, specialties, areas, price, profile_url,
             review_summary, rating, licensed, sources, status, loaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'listed', now())
     ON CONFLICT (destination_id, profile_url) DO UPDATE
        SET name = $2, kind = $3, languages = $4, specialties = $5, areas = $6, price = $7,
            review_summary = $9, rating = $10, licensed = $11, sources = $12, loaded_at = now()
      WHERE g.status = 'listed'`,
    [
      destinationId,
      row.name,
      row.type,
      languageCodes(row.languages),
      row.specialties,
      row.areas,
      price === null
        ? null
        : JSON.stringify({ text: price.text, source_url: price.source_url ?? null }),
      profileUrl,
      JSON.stringify({ en: row.review_summary_en, vi: row.review_summary_vi }),
      rating === null ? null : JSON.stringify(rating),
      row.licensed,
      [...new Set(row.sources)].slice(0, 6),
    ],
  );
}

/** Takes a guide out of every reader on request; a later load leaves it out too. */
export async function hideGuide(pool: pg.Pool, profileUrl: string): Promise<number> {
  return withSystem(pool, async (tx) => {
    const result = await tx.query(
      `UPDATE local_guides SET status = 'hidden' WHERE profile_url = $1 AND status = 'listed'`,
      [profileUrl],
    );
    return result.rowCount ?? 0;
  });
}

/**
 * Removes a guide on request: everything is blanked but the profile page, kept only so no later
 * load lists them again.
 */
export async function removeGuide(pool: pg.Pool, profileUrl: string): Promise<number> {
  return withSystem(pool, async (tx) => {
    await tx.query(
      `UPDATE local_guides SET merged_into_id = NULL
        WHERE merged_into_id IN (SELECT id FROM local_guides WHERE profile_url = $1)`,
      [profileUrl],
    );
    const result = await tx.query(
      `UPDATE local_guides
          SET status = 'removed', name = '', review_summary = '{}', price = NULL, rating = NULL,
              languages = '{}', specialties = '{}', areas = '{}', sources = '{}',
              merged_into_id = NULL
        WHERE profile_url = $1`,
      [profileUrl],
    );
    return result.rowCount ?? 0;
  });
}

/** Marks `duplicateUrl` as the same guide as `intoUrl` in each destination both are listed in. */
export async function mergeGuide(
  pool: pg.Pool,
  duplicateUrl: string,
  intoUrl: string,
): Promise<number> {
  return withSystem(pool, async (tx) => {
    const result = await tx.query(
      `UPDATE local_guides AS dup SET status = 'hidden', merged_into_id = keep.id
         FROM local_guides AS keep
        WHERE dup.profile_url = $1 AND keep.profile_url = $2
          AND keep.destination_id = dup.destination_id AND keep.status = 'listed'
          AND dup.status = 'listed'`,
      [duplicateUrl, intoUrl],
    );
    return result.rowCount ?? 0;
  });
}
