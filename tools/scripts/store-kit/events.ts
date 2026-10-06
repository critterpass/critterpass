/**
 * In-App Event cards (the legendary window) as App Store Connect API bodies. Event dates come from
 * the legendary windows content at submission time; the card copy comes from the listing.
 *
 *   pnpm tsx tools/scripts/store-kit/events.ts --dry-run [--app-id <App Store Connect app id>]
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { storeListings } from '@cp/content/store';

import { inAppEvents } from './app-store-payloads';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: true },
      'app-id': { type: 'string', default: '<app-id>' },
    },
  });
  console.log(JSON.stringify(inAppEvents(storeListings(), values['app-id']), null, 2));
  console.log('dry run: create these in App Store Connect once the production app record exists');
}
