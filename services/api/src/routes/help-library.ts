/**
 * `GET /v1/help/library?locale` (docs/api-contracts.md §5.5): every published help article in the
 * reader's language and in English (the fallback), with its body, so the phone can keep the help
 * centre as its last good copy and read and search it offline. Search vectors and embeddings never
 * leave the server.
 */
import { withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

export interface LibraryArticle {
  readonly slug: string;
  readonly locale: string;
  readonly category: string;
  readonly title: string;
  readonly summary: string;
  readonly body_md: string;
}

export interface HelpLibrary {
  readonly articles: readonly LibraryArticle[];
}

const querySchema = z.object({
  locale: z
    .string()
    .regex(/^[a-z]{2}(?:-[A-Za-z]{2,4})?$/u)
    .default('en'),
});

export function registerHelpLibraryRoute(app: OpenAPIHono<AppEnv>, deps: SharedContentDeps): void {
  app.get('/v1/help/library', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const parsed = querySchema.safeParse(c.req.query());
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'help_library_query' });
    const { locale } = parsed.data;
    const base = locale.split('-')[0] ?? locale;
    const articles = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const result = await tx.query<LibraryArticle>(
        `SELECT slug, locale, category, title, summary, body_md FROM help_articles
          WHERE locale = ANY($1::text[])
          ORDER BY title, locale, slug`,
        [[...new Set([locale, base, 'en'])]],
      );
      return result.rows;
    });
    const body: HelpLibrary = { articles };
    return sendSharedContent(c, body);
  });
}
