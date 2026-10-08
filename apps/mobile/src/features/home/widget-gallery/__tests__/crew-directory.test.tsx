/**
 * The crews file the system's surfaces read (Siri's "Switch crew", the notification extension):
 * written from the reader's own synced crews in the shape the extensions decode, again only when
 * the crews change, and where a "Switch crew" link lands.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { act, render } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { createCrewDirectoryWriter, crewDirectory } from '../crew-directory';
import { crewShortcutLanding } from '../shortcut-routes';
import { useCrewDirectorySync } from '../use-crew-directory-sync';

const ID = (n: number) => `0199a3c0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const BALI = ID(1);
const KYOTO = ID(2);
const OTHERS = ID(3);
const PON = ID(11);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack !== null) removeDir(stack.dir);
  stack = null;
});

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 120)));

async function member(s: TestLocalFirst, crewId: string, uid: string, status = 'active') {
  await s.db.execute(
    `INSERT INTO crew_members (id, crew_id, user_id, status, created_at)
     VALUES (?, ?, ?, ?, '2026-09-01 00:00:00Z')`,
    [`${crewId}:${uid}`, crewId, uid, status],
  );
}

describe('the crews file for the system surfaces', () => {
  it('lists only the crews the reader is in, with first names, and rewrites when they change', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const s = stack;
    await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      s.uid,
    ]);
    await s.db.execute('INSERT INTO crews (id, name) VALUES (?, ?), (?, ?), (?, ?)', [
      BALI,
      'The Bali Six',
      KYOTO,
      'Kyoto Crew',
      OTHERS,
      'Not mine',
    ]);
    await s.db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?)', [
      s.uid,
      'Winston Ng',
      PON,
      'Pon Somchai',
    ]);
    await member(s, BALI, s.uid);
    await member(s, BALI, PON);
    await member(s, KYOTO, s.uid, 'left');
    await member(s, OTHERS, PON);

    const files: { key: string; body: Record<string, unknown> }[] = [];
    const ports = {
      sink: {
        writeSnapshot: (key: string, json: string) =>
          void files.push({ key, body: JSON.parse(json) as Record<string, unknown> }),
        reloadWidgets: () => undefined,
      },
    };
    function Probe() {
      useCrewDirectorySync(ports);
      return null;
    }
    await render(<Probe />, { wrapper: s.wrapper });
    await settle();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      key: 'crews',
      body: {
        schema: 1,
        crews: {
          [BALI]: {
            name: 'The Bali Six',
            members: { [s.uid]: { first_name: 'Winston' }, [PON]: { first_name: 'Pon' } },
          },
        },
      },
    });
    expect(Object.keys(files[0]?.body['crews'] as object)).toEqual([BALI]);
    expect(typeof files[0]?.body['generated_at']).toBe('string');

    await s.db.execute('UPDATE crews SET name = ? WHERE id = ?', ['Bali Seven', BALI]);
    await settle();
    expect(files).toHaveLength(2);
    expect(files[1]?.body['crews']).toMatchObject({ [BALI]: { name: 'Bali Seven' } });
  });

  it('does not write again when nothing about the crews changed', () => {
    const writes: string[] = [];
    const writer = createCrewDirectoryWriter({ writeSnapshot: (key) => void writes.push(key) });
    const rows = [{ crew_id: BALI, crew_name: 'The Bali Six', user_id: PON, display_name: 'Pon' }];
    expect(writer.write(rows)).toBe(true);
    expect(writer.write([...rows])).toBe(false);
    expect(writes).toEqual(['crews']);
  });

  it('leaves out a crew with no name and a member with none', () => {
    expect(
      crewDirectory([
        { crew_id: BALI, crew_name: '  ', user_id: PON, display_name: 'Pon' },
        { crew_id: KYOTO, crew_name: 'Kyoto Crew', user_id: PON, display_name: null },
        { crew_id: KYOTO, crew_name: 'Kyoto Crew', user_id: null, display_name: null },
      ]),
    ).toEqual({ [KYOTO]: { name: 'Kyoto Crew', members: {} } });
  });
});

describe('where "Switch crew" lands', () => {
  it('makes the named crew active and opens Home on it; anything else just opens Home', () => {
    expect(crewShortcutLanding(BALI.toUpperCase())).toEqual({
      crewId: BALI,
      href: `/?crewId=${BALI}`,
    });
    expect(crewShortcutLanding('new')).toEqual({ crewId: null, href: '/' });
    expect(crewShortcutLanding(undefined)).toEqual({ crewId: null, href: '/' });
    expect(crewShortcutLanding(`${BALI}&notice=x`)).toEqual({ crewId: null, href: '/' });
  });
});
