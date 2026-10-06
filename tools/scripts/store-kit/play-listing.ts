/**
 * Uploads the Play store listing text for every language that has a listing, through the Google
 * Play Developer API: open an edit, update each language, validate, then commit (or, with
 * `--dry-run`, delete the edit so nothing changes). Without credentials `--dry-run` validates the
 * copy and prints what would be sent.
 *
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=certs/play-service-account.json \
 *   pnpm tsx tools/scripts/store-kit/play-listing.ts [--dry-run] [--package app.critterpass]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { STORE_LOCALES, storeListings, type Listing } from '@cp/content/store';
import type { AppLocale } from '@cp/domain';

import { googleAccessToken, type ServiceAccount } from './google-auth';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

export interface PlayListing {
  readonly language: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly fullDescription: string;
}

export function playListings(listings: Partial<Record<AppLocale, Listing>>): PlayListing[] {
  return (Object.entries(listings) as [AppLocale, Listing][]).map(([locale, listing]) => ({
    language: STORE_LOCALES[locale].play,
    title: listing.play.title,
    shortDescription: listing.play.shortDescription,
    fullDescription: listing.play.fullDescription,
  }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: false },
      package: { type: 'string', default: 'app.critterpass' },
    },
  });
  const listings = playListings(storeListings());
  for (const l of listings) {
    console.log(
      `${l.language}: "${l.title}" · short ${l.shortDescription.length}/80 · full ${l.fullDescription.length}/4000`,
    );
  }
  const credentials = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credentials) {
    if (values['dry-run']) {
      console.log('no GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: copy validated, nothing sent');
      return;
    }
    throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set');
  }
  const account = JSON.parse(readFileSync(credentials, 'utf8')) as ServiceAccount;
  const token = await googleAccessToken(account, SCOPE);
  const call = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${API}/${values.package}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(`${method} ${path} failed: ${response.status} ${text.slice(0, 300)}`);
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  };
  const edit = await call('POST', '/edits', {});
  const editId = String(edit.id);
  try {
    for (const l of listings) {
      await call('PUT', `/edits/${editId}/listings/${l.language}`, l);
    }
    await call('POST', `/edits/${editId}:validate`);
    if (values['dry-run']) {
      console.log(`edit ${editId} validated; discarded (dry run)`);
      await call('DELETE', `/edits/${editId}`);
      return;
    }
    await call('POST', `/edits/${editId}:commit`);
    console.log(`edit ${editId} committed: ${listings.length} languages`);
  } catch (error) {
    await call('DELETE', `/edits/${editId}`).catch(() => undefined);
    throw error;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
