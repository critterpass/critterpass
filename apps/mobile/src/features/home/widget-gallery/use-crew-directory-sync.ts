/**
 * Keeps the App Group's crews file (./crew-directory.ts) in step with the synced crews for as long
 * as the signed-in session is mounted. Without the App Group module (older builds, Android, web)
 * nothing is read and nothing is written.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: SQL. */
import { useEffect } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { watchQuery } from '../data/watch-query';

import {
  CREW_DIRECTORY_SQL,
  CREW_DIRECTORY_TABLES,
  createCrewDirectoryWriter,
  type CrewDirectoryRow,
} from './crew-directory';
import { installedWidgetPorts, type WidgetPorts } from './widget-ports';

const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';

export function useCrewDirectorySync(
  ports: Pick<WidgetPorts, 'sink'> | null = installedWidgetPorts(),
): void {
  const { db } = useLocalFirst();
  useEffect(() => {
    if (ports === null) return undefined;
    const writer = createCrewDirectoryWriter(ports.sink);
    let stopCrews = () => {};
    let watching: string | null = null;
    const stopUid = watchQuery<{ value: string }>(
      db,
      UID_SQL,
      [OWNER_UID_KEY],
      ['local_state'],
      (rows) => {
        const uid = rows[0]?.value ?? null;
        if (uid === watching) return;
        watching = uid;
        stopCrews();
        stopCrews =
          uid === null
            ? () => {}
            : watchQuery<CrewDirectoryRow>(
                db,
                CREW_DIRECTORY_SQL,
                [uid],
                CREW_DIRECTORY_TABLES,
                (crews) => {
                  try {
                    writer.write(crews);
                  } catch {
                    // A refused write leaves the last file in place; the next change writes again.
                  }
                },
              );
      },
    );
    return () => {
      stopUid();
      stopCrews();
    };
  }, [db, ports]);
}
