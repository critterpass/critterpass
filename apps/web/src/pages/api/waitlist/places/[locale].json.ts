/* eslint-disable lingui/no-unlocalized-strings -- header values, not UI copy. */
import type { APIRoute, GetStaticPaths } from 'astro';

import { SITE_LOCALE_CODES } from '../../../../lib/locale';
import { placeRows } from '../../../../lib/place-catalogue';

// One static file per language, built with the site: the list only changes with the data.
export const prerender = true;

export const getStaticPaths = (() =>
  SITE_LOCALE_CODES.map((locale) => ({ params: { locale } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(placeRows(params['locale'] ?? 'en')), {
    headers: { 'content-type': 'application/json' },
  });
