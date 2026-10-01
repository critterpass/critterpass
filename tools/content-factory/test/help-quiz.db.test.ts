import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { HELP_CATEGORIES } from '@cp/content';
import { createPool, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { committedItems } from '../src/committed';
import { CATEGORY_QUERIES } from '../src/kinds/help';
import { DESIGNED_QUESTION } from '../src/kinds/taste-quiz';
import { validateCommitted } from '../src/pipeline';
import { writeHelpMdx } from '../src/stages/pull';

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;

beforeAll(async () => {
  container = await startPostgres();
  pool = createPool(container.getConnectionUri());
  await runMigrations(pool);
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

/** Any of the query's meaningful words, the way a help search box matches. */
const anyWord = (query: string) =>
  query
    .split(/\s+/u)
    .filter((word) => word.length >= 4)
    .join(' | ');

describe('help centre', () => {
  it('finds an article for every 3p-1 category search', async () => {
    const articles = committedItems('help');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact, item_count,
         approved_by, approved_at)
       VALUES ('help', 1, 'help-search', 'Help', 'published', 'publish', repeat('c', 64), '{}', 0, gen_random_uuid(), now())
       RETURNING id`,
    );
    for (const a of articles) {
      await pool.query(
        `INSERT INTO help_articles (slug, locale, category, title, summary, body_md, release_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [a.slug, a.locale, a.category, a.title, a.summary, a.body_md, rows[0]!.id],
      );
    }
    for (const category of HELP_CATEGORIES) {
      const found = await pool.query<{ category: string }>(
        `SELECT category FROM help_articles
         WHERE fts @@ to_tsquery('simple', $1)
         ORDER BY ts_rank(fts, to_tsquery('simple', $1)) DESC LIMIT 3`,
        [anyWord(CATEGORY_QUERIES[category])],
      );
      expect(
        found.rows.map((r) => r.category),
        CATEGORY_QUERIES[category],
      ).toContain(category);
    }
  });

  it('writes the published articles as MDX', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'content-mdx-'));
    const [first] = committedItems('help');
    writeHelpMdx([first!], root);
    const mdx = readFileSync(path.join(root, 'mdx', 'help', 'en', `${first!.slug}.mdx`), 'utf8');
    expect(mdx.startsWith(`---\ntitle: ${JSON.stringify(first!.title)}`)).toBe(true);
    for (const { report } of validateCommitted('help')) expect(report.severity).not.toBe('fail');
  });
});

describe('taste quiz', () => {
  it('has six questions with the designed one third', () => {
    const quiz = committedItems('taste_quiz').sort((a, b) => a.order - b.order);
    expect(quiz.map((q) => q.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(quiz[2]).toEqual(DESIGNED_QUESTION);
  });
});
