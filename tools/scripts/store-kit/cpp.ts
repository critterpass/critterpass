/**
 * Custom Product Pages (crew trip, critters) as App Store Connect API bodies.
 *
 *   pnpm tsx tools/scripts/store-kit/cpp.ts --dry-run [--app-id <App Store Connect app id>]
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { storeListings } from '@cp/content/store';

import { customProductPages } from './app-store-payloads';

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      'dry-run': { type: 'boolean', default: true },
      'app-id': { type: 'string', default: '<app-id>' },
    },
  });
  console.log(JSON.stringify(customProductPages(storeListings(), values['app-id']), null, 2));
  console.log('dry run: create these in App Store Connect once the production app record exists');
}
