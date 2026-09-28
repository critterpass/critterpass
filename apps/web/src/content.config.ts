/* eslint-disable lingui/no-unlocalized-strings -- collection folder and file pattern, not UI copy. */
/**
 * Content collections read straight from @cp/content: tips (MDX, frontmatter validated by the
 * package's schema, so bad frontmatter stops the site from compiling) and the legal set.
 */
import { legalFrontmatterSchema } from '@cp/content/legal';
import { tipFrontmatterSchema } from '@cp/content/tips';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const tips = defineCollection({
  loader: glob({ base: '../../packages/content/src/tips', pattern: '*.mdx' }),
  schema: tipFrontmatterSchema,
});

// One entry per `<doc>/<version>.mdx`, with ids like `privacy/1.0.0`.
const legal = defineCollection({
  loader: glob({
    base: '../../packages/content/src/legal',
    pattern: '*/*.mdx',
    generateId: ({ entry }) => entry.replace(/\.mdx$/u, ''),
  }),
  schema: legalFrontmatterSchema,
});

export const collections = { tips, legal };
