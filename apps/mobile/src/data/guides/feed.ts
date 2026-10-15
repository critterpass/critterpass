/**
 * Feeds what the app knows about guides from the local database: every synced `guides` row (name,
 * critter, accent), so a screen draws any city's guide from its row, and the public
 * `guides.per_city` switch from `client_config`. Runs while a session's database is open; signing
 * out forgets the switch.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { registerOnSignOut } from '@/data/auth/sign-out-hooks';
import {
  applyGuideRows,
  applyGuidesPerCity,
  GUIDES_PER_CITY_KEY,
  readGuidesPerCity,
  resetGuidesPerCity,
} from '@/lib/navigation/active-guide';

const GUIDES_SQL = 'SELECT slug, name, critter_key, accent FROM guides';
const SWITCH_SQL = 'SELECT value FROM client_config WHERE key = ?';

interface GuideRecord {
  readonly slug: string | null;
  readonly name: string | null;
  readonly critter_key: string | null;
  readonly accent: string | null;
}

let signOutRegistered = false;

interface RunningFeed {
  readonly db: AbstractPowerSyncDatabase;
  readonly stop: () => void;
  users: number;
}

let running: RunningFeed | null = null;

/**
 * Starts feeding from this database; the returned function lets go of it. Every screen that reads
 * guides starts it (the tab bar, and a destination or place page opened straight from a link, with
 * no tabs under it): one feed runs per database, and it stops when the last reader lets go.
 */
export function feedGuides(db: AbstractPowerSyncDatabase): () => void {
  if (running?.db !== db) {
    running?.stop();
    running = { db, stop: startFeed(db), users: 0 };
  }
  const feed = running;
  feed.users += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    feed.users -= 1;
    if (feed.users > 0 || running !== feed) return;
    feed.stop();
    running = null;
  };
}

function startFeed(db: AbstractPowerSyncDatabase): () => void {
  if (!signOutRegistered) {
    signOutRegistered = true;
    registerOnSignOut(() => resetGuidesPerCity());
  }
  const controller = new AbortController();
  const loadRows = () =>
    db.getAll<GuideRecord>(GUIDES_SQL).then(
      (rows) => {
        // An empty table (signed out, not synced yet) keeps what is known.
        if (controller.signal.aborted || rows.length === 0) return;
        applyGuideRows(
          rows.flatMap((row) =>
            row.slug === null || row.name === null
              ? []
              : [
                  {
                    slug: row.slug,
                    name: row.name,
                    critterKey: row.critter_key,
                    accent: row.accent,
                  },
                ],
          ),
        );
      },
      () => undefined,
    );
  const loadSwitch = () =>
    db.getAll<{ value: string | null }>(SWITCH_SQL, [GUIDES_PER_CITY_KEY]).then(
      (rows) => {
        const row = rows[0];
        // No row (an older server, not synced yet) keeps the last value.
        if (!controller.signal.aborted && row !== undefined) {
          applyGuidesPerCity(readGuidesPerCity(row.value));
        }
      },
      () => undefined,
    );
  void loadRows();
  void loadSwitch();
  db.onChange(
    { onChange: () => void loadRows() },
    { tables: ['guides'], throttleMs: 200, signal: controller.signal },
  );
  db.onChange(
    { onChange: () => void loadSwitch() },
    { tables: ['client_config'], throttleMs: 200, signal: controller.signal },
  );
  return () => controller.abort();
}
