/* eslint-disable lingui/no-unlocalized-strings -- feed site and XML fragments, not UI copy. */
/** The tips journal as RSS 2.0: newest first, one item per published article. */
import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';

import { tipsCopy } from '../components/site/copy/tips';
import { siteTranslator } from '../components/site/i18n';
import { allTips } from '../components/site/tips/tips-data';

export const GET: APIRoute = async ({ site }) => {
  const t = await siteTranslator();
  const tips = (await allTips()).filter((tip) => !tip.data.draft);
  return rss({
    title: t(tipsCopy.rssTitle),
    description: t(tipsCopy.lede),
    site: site ?? 'https://critterpass.app',
    items: tips.map((tip) => ({
      title: tip.data.title,
      description: tip.data.summary,
      link: `/tips/${tip.slug}`,
      pubDate: tip.data.published_at,
      categories: [tip.data.category],
    })),
    customData: '<language>en</language>',
    trailingSlash: false,
  });
};
