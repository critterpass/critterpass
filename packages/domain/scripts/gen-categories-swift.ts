/**
 * Writes the iOS targets' notification category table from the domain's
 * (src/surfaces/notification-categories.ts); the app's categories test fails when the checked-in
 * file drifts.
 *
 *   pnpm --filter @cp/domain exec tsx scripts/gen-categories-swift.ts          # write
 *   pnpm --filter @cp/domain exec tsx scripts/gen-categories-swift.ts --check  # fail on drift
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  CATEGORIES_SWIFT_FILE,
  renderCategoriesSwift,
} from '../src/surfaces/notification-categories';

const file = path.resolve(import.meta.dirname, '../../..', CATEGORIES_SWIFT_FILE);
const swift = renderCategoriesSwift();

if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== swift) {
    console.error(`${CATEGORIES_SWIFT_FILE} is out of date: run scripts/gen-categories-swift.ts`);
    process.exit(1);
  }
} else {
  writeFileSync(file, swift);
}
