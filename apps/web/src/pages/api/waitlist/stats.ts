/* eslint-disable lingui/no-unlocalized-strings -- HTTP header values, not JSX/UI copy. */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { countAllEntries } from '../../../lib/waitlist-repository';
import { firstWavePercent, firstWaveSeatsLeft, queueCount } from '../../../lib/waitlist';

export const prerender = false;

export const GET: APIRoute = async () => {
  const realSignups = await countAllEntries(env.DB);
  const body = {
    count: queueCount(realSignups),
    waveLeft: firstWaveSeatsLeft(realSignups),
    wavePercent: firstWavePercent(realSignups),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};
