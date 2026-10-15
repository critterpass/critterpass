/**
 * The guides feed over the phone's real local database: a destination page opened straight from a
 * link starts the feed itself, so it learns the per-city switch and the city guide rows with no tab
 * bar under it, and every reader shares one feed that stops when the last one lets go.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import {
  installKey,
  MemoryKeyStore,
  openNodeDatabase,
  removeDir,
  tempDatabaseDir,
} from '@/data/powersync/test-support/open-node-database';
import { guideRow, guidesPerCity, resetGuidesPerCity } from '@/lib/navigation/active-guide';

import { feedGuides } from '../feed';

const opened: { db: AbstractPowerSyncDatabase; dir: string }[] = [];
afterEach(async () => {
  resetGuidesPerCity();
  for (const { db, dir } of opened.splice(0)) {
    await db.close().catch(() => undefined);
    removeDir(dir);
  }
});

async function database(): Promise<AbstractPowerSyncDatabase> {
  const dir = tempDatabaseDir();
  const db = await openNodeDatabase({ dir, key: await installKey(new MemoryKeyStore()) });
  opened.push({ db, dir });
  return db;
}

async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('feedGuides', () => {
  it('feeds the switch and the rows, once for every reader, and stops with the last', async () => {
    const db = await database();
    await db.execute("INSERT INTO client_config (id, key, value) VALUES (?, ?, 'true')", [
      'guides.per_city',
      'guides.per_city',
    ]);
    await db.execute(
      "INSERT INTO guides (id, slug, name, critter_key) VALUES ('g1', 'ngua', 'Ngựa', 'cp-006')",
    );

    const tabBar = feedGuides(db);
    const page = feedGuides(db);
    await until(() => guidesPerCity() && guideRow('ngua') !== undefined);
    expect(guidesPerCity()).toBe(true);
    expect(guideRow('ngua')?.name).toBe('Ngựa');

    // The tab bar leaving keeps the page's feed running.
    tabBar();
    await db.execute("UPDATE client_config SET value = 'false' WHERE key = 'guides.per_city'");
    await until(() => !guidesPerCity());
    expect(guidesPerCity()).toBe(false);

    // With the last reader gone, nothing feeds any more.
    page();
    await db.execute("UPDATE client_config SET value = 'true' WHERE key = 'guides.per_city'");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(guidesPerCity()).toBe(false);
  });
});
