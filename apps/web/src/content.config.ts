/* eslint-disable lingui/no-unlocalized-strings -- collection folder and file pattern, not UI copy. */
/**
 * Content collections read straight from @cp/content: tips (MDX, frontmatter validated by the
 * package's schema, so bad frontmatter stops the site from compiling).
 */
import { tipFrontmatterSchema } from '@cp/content/tips';
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const tips = defineCollection({
  loader: glob({ base: '../../packages/content/src/tips', pattern: '*.mdx' }),
  schema: tipFrontmatterSchema,
});

export const collections = { tips };
