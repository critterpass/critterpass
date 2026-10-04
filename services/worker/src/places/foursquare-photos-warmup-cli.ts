/**
 * Runs the Foursquare photo warm-up (foursquare-photos-warmup.ts) from anywhere that reaches the
 * database and has the worker's Foursquare variables (`FOURSQUARE_API_KEY`,
 * `FOURSQUARE_MONTHLY_CALL_CAP`). Every call costs a Premium Place Details call and counts against
 * the shared monthly cap, so the budget is always passed:
 *
 *   railway run --service worker --environment <environment> -- \
 *     pnpm --filter @cp/worker exec tsx src/places/foursquare-photos-warmup-cli.ts \
 *       --max-calls 400 [--destination da-nang] [--dry-run]
 *
 * `--dry-run` only counts: the places still to read and the calls the budget and the month's cap
 * would allow. It calls nothing and writes nothing.
 */
import { createPool } from '@cp/db';

import type { JobLogger } from '../boss/define-job';
import { runFoursquarePhotoWarmup } from './foursquare-photos-warmup';

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Log lines carry counts and place ids only; an error is reduced to its message. */
function line(details: object): string {
  const { err, ...rest } = details as { err?: unknown };
  return JSON.stringify(err === undefined ? rest : { ...rest, err: String(err) });
}

const logger: JobLogger = {
  info: (details, message) => console.log(message, line(details)),
  warn: (details, message) => console.warn(message, line(details)),
  error: (details, message) => console.error(message, line(details)),
};

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_URL is required');
  const dryRun = process.argv.includes('--dry-run');
  const maxCalls = Number(flag('max-calls'));
  if (!Number.isInteger(maxCalls) || maxCalls <= 0) {
    throw new Error('--max-calls <a positive whole number> is required');
  }
  const apiKey = process.env['FOURSQUARE_API_KEY'];
  if (apiKey === undefined && !dryRun) throw new Error('FOURSQUARE_API_KEY is required');
  const monthlyCallCap = Number(process.env['FOURSQUARE_MONTHLY_CALL_CAP'] ?? 4000);
  if (!Number.isInteger(monthlyCallCap) || monthlyCallCap <= 0) {
    throw new Error('FOURSQUARE_MONTHLY_CALL_CAP must be a positive whole number');
  }
  const destination = flag('destination');
  const pool = createPool({ connectionString, max: 2 });
  try {
    const report = await runFoursquarePhotoWarmup(
      pool,
      { apiKey: apiKey ?? '', monthlyCallCap },
      { maxCalls, dryRun, ...(destination === undefined ? {} : { destination }) },
      logger,
    );
    console.log(
      dryRun
        ? `dry run: ${report.places} places to read; ${report.calls} calls would be made ` +
            `(budget ${maxCalls}, ${report.capLeft} left under this month's cap); nothing called or written`
        : `${report.places} places to read; ${report.calls} calls made: ${report.placesWithPhotos} places with photos ` +
            `(${report.photosKept} photos kept), ${report.placesWithoutPhotos} without, ${report.failed} failed`,
      report.stopped === undefined ? '' : `; stopped: ${report.stopped}`,
    );
  } finally {
    await pool.end();
  }
}

await main();
