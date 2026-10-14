/**
 * A base destination's photo: its Wikivoyage banner (P948), else its Wikidata image (P18), from
 * Wikimedia Commons. File metadata comes 50 titles a query; only public domain, CC0, CC BY and
 * CC BY-SA files with an author are kept, each as a `media_assets` row with its licence, author,
 * credit and link, under one `content_releases` row (kind `destinations`) per build. Every new or
 * moved file then gets a `media.ingest` job, two a second. A destination with a hand-picked photo
 * (from a `media` release) is left alone.
 */
import { createHash } from 'node:crypto';

import { sendInTx, withSystem } from '@cp/db';
import {
  commonsCredit,
  destinationSubject,
  MEDIA_INGEST_QUEUE,
  type CommonsPage,
} from '@cp/domain';
import type pg from 'pg';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT = 'CritterPass-destinations/1.0 (https://critterpass.app; ops@critterpass.app)';
const TITLES_PER_QUERY = 50;
const DOWNLOAD_PX = 1920;
/** `media.ingest` jobs start at most this many a second. */
export const INGESTS_PER_SECOND = 2;

export interface PhotoRequest {
  readonly slug: string;
  readonly file: string;
}

export interface PhotoCounts {
  readonly asked: number;
  readonly stored: number;
  readonly refused: number;
  readonly missing: number;
  readonly handPicked: number;
  readonly queued: number;
}

/** File pages by the `File:` title asked (Commons normalises underscores and case). */
export async function fetchCommonsPages(
  titles: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, CommonsPage>> {
  const pages = new Map<string, CommonsPage>();
  const unique = [...new Set(titles)].sort();
  for (let at = 0; at < unique.length; at += TITLES_PER_QUERY) {
    const chunk = unique.slice(at, at + TITLES_PER_QUERY);
    // Fifty long non-Latin titles overflow a URL (HTTP 414), so the query goes as a form body.
    const response = await fetchImpl(COMMONS_API, {
      method: 'POST',
      headers: { 'user-agent': USER_AGENT },
      body: new URLSearchParams({
        action: 'query',
        format: 'json',
        formatversion: '2',
        titles: chunk.join('|'),
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        iiurlwidth: String(DOWNLOAD_PX),
      }),
    });
    if (!response.ok) throw new Error(`Commons query failed: HTTP ${response.status}`);
    const body = (await response.json()) as {
      query?: { pages?: CommonsPage[]; normalized?: { from: string; to: string }[] };
    };
    const asked = new Map(chunk.map((title) => [title, title]));
    for (const { from, to } of body.query?.normalized ?? []) asked.set(to, from);
    for (const page of body.query?.pages ?? [])
      pages.set(asked.get(page.title) ?? page.title, page);
  }
  return pages;
}

async function openRelease(
  tx: pg.PoolClient,
  slugs: readonly string[],
  now: Date,
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
       artifact, item_count, notes)
     SELECT 'destinations', v, 'destinations-' || v, $1, 'draft', 'publish', $2, $3, $4,
            'System build: Wikimedia Commons photos of base-set destinations'
       FROM (SELECT coalesce(max(version), 0) + 1 AS v FROM content_releases
              WHERE kind = 'destinations') next
     RETURNING id`,
    [
      `Destination photos ${now.toISOString().slice(0, 10)}`,
      createHash('sha256').update(slugs.join('\n')).digest('hex'),
      JSON.stringify({ kind: 'destinations', photos: slugs.length }),
      slugs.length,
    ],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('could not open a destinations release');
  return id;
}

/** Subjects that already have a photo from a hand-reviewed `media` release. */
async function handPickedSubjects(tx: pg.PoolClient): Promise<Set<string>> {
  const { rows } = await tx.query<{ subject: string }>(
    `SELECT DISTINCT unnest(m.subject_keys) AS subject
       FROM media_assets m
       LEFT JOIN content_releases r ON r.id = m.release_id
      WHERE r.kind IS DISTINCT FROM 'destinations'`,
  );
  return new Set(rows.map((row) => row.subject));
}

export async function storeBasePhotos(
  pool: pg.Pool,
  requests: readonly PhotoRequest[],
  options: { readonly fetch?: typeof fetch; readonly now?: Date } = {},
): Promise<PhotoCounts> {
  const now = options.now ?? new Date();
  const pages = await fetchCommonsPages(
    requests.map((request) => `File:${request.file}`),
    options.fetch,
  );
  return withSystem(pool, async (tx) => {
    const picked = await handPickedSubjects(tx);
    const wanted = requests.filter((request) => !picked.has(destinationSubject(request.slug)));
    const releaseId = await openRelease(
      tx,
      wanted.map((request) => request.slug),
      now,
    );
    let stored = 0;
    let refused = 0;
    let missing = 0;
    const pending: string[] = [];
    for (const request of wanted) {
      const page = pages.get(`File:${request.file}`);
      const info = page?.imageinfo?.[0];
      if (page === undefined || info === undefined || page.missing === true) {
        missing += 1;
        continue;
      }
      const credit = commonsCredit(page);
      if (credit === null || !/^image\/(jpeg|png|webp)$/u.test(info.mime)) {
        refused += 1;
        continue;
      }
      const scale = Math.min(1, DOWNLOAD_PX / info.width);
      const { rows } = await tx.query<{ id: string; status: string }>(
        `INSERT INTO media_assets (kind, source, source_id, source_url, download_url, subject_keys,
           rank, title, author, licence, licence_url, attribution_required, credit, width, height,
           release_id)
         VALUES ('photo', 'wikimedia', $1, $2, $3, ARRAY[$4], 0, $5, $6, $7, $8, $9, $10, $11, $12,
           $13)
         ON CONFLICT (source, kind, source_id) DO UPDATE SET
           subject_keys = ARRAY(SELECT DISTINCT unnest(media_assets.subject_keys || EXCLUDED.subject_keys)
                                 ORDER BY 1),
           author = EXCLUDED.author, licence = EXCLUDED.licence,
           licence_url = EXCLUDED.licence_url, credit = EXCLUDED.credit,
           attribution_required = EXCLUDED.attribution_required, release_id = EXCLUDED.release_id,
           download_url = EXCLUDED.download_url,
           status = CASE WHEN media_assets.download_url = EXCLUDED.download_url
             THEN media_assets.status ELSE 'pending' END
         WHERE media_assets.release_id IN (SELECT id FROM content_releases WHERE kind = 'destinations')
         RETURNING id, status`,
        [
          String(page.pageid),
          info.descriptionurl,
          info.thumburl ?? info.url,
          destinationSubject(request.slug),
          credit.title,
          credit.author,
          credit.licence,
          credit.licenceUrl,
          credit.attributionRequired,
          credit.credit,
          Math.round(info.width * scale),
          Math.round(info.height * scale),
          releaseId,
        ],
      );
      const row = rows[0];
      if (row === undefined) continue;
      stored += 1;
      if (row.status !== 'ready') pending.push(row.id);
    }
    // Earlier builds' rows that this build no longer names stay: a destination keeps its photo.
    for (const [i, id] of pending.entries()) {
      await sendInTx(
        tx,
        MEDIA_INGEST_QUEUE,
        { asset_id: id },
        { singletonKey: id, startAfter: Math.floor(i / INGESTS_PER_SECOND) },
      );
    }
    return {
      asked: requests.length,
      stored,
      refused,
      missing,
      handPicked: requests.length - wanted.length,
      queued: pending.length,
    };
  });
}
