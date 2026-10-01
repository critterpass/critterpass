/**
 * The app's language reaches the server once per change: reported when the session starts, again
 * when the person switches language, never twice for the same language, and through the offline
 * queue (the real local database; nothing here needs the network).
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { listQueuedCommands } from '../../status/use-queued-commands';
import {
  startAppLocaleReport,
  type AppLocaleSource,
  type ReportedLocaleStore,
} from '../report-app-locale';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

const UID = '0198c1d2-0000-7000-8000-00000000a001';

/** The UI language as lib/i18n exposes it: a current value and a change subscription. */
function localeSource(initial?: string): AppLocaleSource & { switchTo(locale: string): void } {
  let current = initial;
  const listeners = new Set<(locale: string) => void>();
  return {
    current: () => current,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    switchTo: (locale) => {
      current = locale;
      for (const listener of listeners) listener(locale);
    },
  };
}

function memoryStore(): ReportedLocaleStore {
  let value: string | null = null;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
  };
}

let stack: TestLocalFirst;
const errors: unknown[] = [];

beforeEach(async () => {
  // Uploads are held and the transport is unreachable: this is a phone without network.
  stack = await openTestLocalFirst({ uid: UID, holdUploads: true });
  errors.length = 0;
});

afterEach(async () => {
  await stack.close();
  removeDir(stack.dir);
});

async function queuedLocales(): Promise<unknown[]> {
  const rows = await stack.db.getAll<{ envelope: string }>(
    "SELECT envelope FROM commands WHERE cmd = 'set_app_locale' ORDER BY seq",
  );
  return rows.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
}

function start(locale: ReturnType<typeof localeSource>, reported: ReportedLocaleStore, uid = UID) {
  return startAppLocaleReport({
    uid,
    commands: stack.value.commands,
    locale,
    reported,
    onError: (error) => errors.push(error),
  });
}

describe('reporting the app language', () => {
  it('queues the resolved language once at start, offline, and not again on the next launch', async () => {
    const reported = memoryStore();
    await start(localeSource('vi'), reported).settled();
    expect(await queuedLocales()).toEqual([{ locale: 'vi' }]);
    expect((await listQueuedCommands(stack.db)).map((command) => command.cmd)).toEqual([
      'set_app_locale',
    ]);

    // A relaunch in the same language has nothing new to say.
    await start(localeSource('vi'), reported).settled();
    expect(await queuedLocales()).toEqual([{ locale: 'vi' }]);
    expect(errors).toEqual([]);
  });

  it('reports again when the language changes, in the order the person switched', async () => {
    const locale = localeSource('en');
    const report = start(locale, memoryStore());
    locale.switchTo('vi');
    locale.switchTo('ja');
    locale.switchTo('ja');
    await report.settled();
    expect(await queuedLocales()).toEqual([{ locale: 'en' }, { locale: 'vi' }, { locale: 'ja' }]);

    report.stop();
    locale.switchTo('ko');
    await report.settled();
    expect(await queuedLocales()).toHaveLength(3);
  });

  it('waits for the first language when the session is up before the catalogs are', async () => {
    const locale = localeSource();
    const report = start(locale, memoryStore());
    await report.settled();
    expect(await queuedLocales()).toEqual([]);
    locale.switchTo('vi');
    await report.settled();
    expect(await queuedLocales()).toEqual([{ locale: 'vi' }]);
  });

  it('reports for the next person who signs in on the same phone', async () => {
    const reported = memoryStore();
    await start(localeSource('vi'), reported).settled();
    await start(localeSource('vi'), reported, '0198c1d2-0000-7000-8000-00000000a002').settled();
    expect(await queuedLocales()).toEqual([{ locale: 'vi' }, { locale: 'vi' }]);
  });

  it('never reports the development pseudo locale', async () => {
    await start(localeSource('en-XA'), memoryStore()).settled();
    expect(await queuedLocales()).toEqual([]);
  });

  it('tries again later when the local write failed', async () => {
    const reported = memoryStore();
    const failing = startAppLocaleReport({
      uid: UID,
      commands: { send: () => Promise.reject(new Error('database is locked')) },
      locale: localeSource('vi'),
      reported,
      onError: (error) => errors.push(error),
    });
    await failing.settled();
    expect(errors).toHaveLength(1);
    expect(reported.read()).toBeNull();

    await start(localeSource('vi'), reported).settled();
    expect(await queuedLocales()).toEqual([{ locale: 'vi' }]);
  });
});
