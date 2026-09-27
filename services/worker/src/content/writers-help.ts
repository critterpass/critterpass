/** Publish writers for help-centre content: articles and the per-country insurance guidance. */
import type { ContentItem } from '@cp/content';
import type pg from 'pg';

import { PublishRefusedError, replaceRows } from './writers-core';

export async function writeHelp(
  tx: pg.PoolClient,
  items: readonly ContentItem<'help'>[],
  releaseId: string,
): Promise<void> {
  const rows = items.map((a) => ({
    slug: a.slug,
    locale: a.locale,
    category: a.category,
    title: a.title,
    summary: a.summary,
    body_md: a.body_md,
  }));
  await replaceRows(
    tx,
    'help_articles',
    ['slug', 'locale'],
    rows,
    releaseId,
    "category <> 'insurance'",
  );
}

export async function writeInsurance(
  tx: pg.PoolClient,
  items: readonly ContentItem<'insurance'>[],
  releaseId: string,
): Promise<void> {
  const pending = items.filter((i) => !i.legal_reviewed).length;
  if (pending > 0)
    throw new PublishRefusedError(`${pending} insurance articles wait for legal review`);
  const rows = items.map((i) => ({
    slug: `insurance-${i.country.toLowerCase()}`,
    locale: 'en',
    category: 'insurance',
    title: i.title,
    summary: `What to check before and during a trip in ${i.country}, and how to claim.`,
    body_md: `${i.body_md}\n\n## Claim checklist\n\n${i.claim_checklist.map((c) => `- ${c}`).join('\n')}\n`,
  }));
  await replaceRows(
    tx,
    'help_articles',
    ['slug', 'locale'],
    rows,
    releaseId,
    "category = 'insurance'",
  );
}
