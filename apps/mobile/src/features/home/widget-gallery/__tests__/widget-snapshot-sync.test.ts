/**
 * The widget snapshot reaching the App Group: the server's body is checked against the contract
 * before the writer sees it, and an invalid or unavailable one is never written; the placed widgets reach `sync_installed_widgets` in the
 * domain's names; and the Swift type the widgets decode is the one the contract renders.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { WIDGET_KINDS, type SyncInstalledWidgetsPayload, type WidgetSnapshot } from '@cp/domain';

import { installedWidgetsPayload, WIDGET_KIND_BY_NATIVE } from '../installed-widgets';
import { WIDGET_SNAPSHOT_SWIFT_FILE, widgetSnapshotSwift } from '../snapshot-swift-source';
import { syncWidgets, type WidgetSnapshotFetch } from '../widget-snapshot-sync';

const MOBILE = path.resolve(__dirname, '../../../../..');
const fixture = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(path.join(MOBILE, 'targets/_shared/Snapshot/Tests/Fixtures/widgets.json'), 'utf8'),
  ) as Record<string, unknown>;

function phone(installed: { kind: string; family: string }[] | null = null) {
  const files = new Map<string, unknown>();
  const synced: SyncInstalledWidgetsPayload[] = [];
  let reloads = 0;
  // The App Group writer's own contract is tested in cp-app-group; here it only records.
  let last = '';
  const writer = {
    write(snapshot: WidgetSnapshot) {
      const { generated_at: _clock, ...rest } = snapshot;
      if (JSON.stringify(rest) === last) return 'unchanged' as const;
      last = JSON.stringify(rest);
      files.set('widgets', snapshot);
      reloads += 1;
      return 'written' as const;
    },
  };
  const run = (fetched: WidgetSnapshotFetch) =>
    syncWidgets({
      fetchSnapshot: () => Promise.resolve(fetched),
      writer,
      installed: installed === null ? null : () => Promise.resolve(installed),
      syncInstalled: (payload) => (synced.push(payload), Promise.resolve()),
    });
  return { files, synced, reloads: () => reloads, run };
}

describe('widget snapshot sync', () => {
  it('writes the snapshot and the entitlements file, then reloads the widgets once', async () => {
    const p = phone();
    expect(await p.run({ kind: 'ok', body: fixture() })).toBe('written');
    expect(p.files.get('widgets')).toMatchObject({
      schema: 1,
      critterdex: { found: 9, total: 150 },
      locked: ['crew', 'next_flight'],
    });
    // A field the contract does not name is not passed on.
    expect(p.files.get('widgets')).not.toHaveProperty('headline_of_a_newer_build');
    expect(p.reloads()).toBe(1);
  });

  it('writes nothing when only the clock moved, and nothing the contract rejects', async () => {
    const p = phone();
    await p.run({ kind: 'ok', body: fixture() });
    expect(
      await p.run({ kind: 'ok', body: { ...fixture(), generated_at: '2026-09-25T02:56:00.000Z' } }),
    ).toBe('unchanged');
    expect(await p.run({ kind: 'ok', body: { ...fixture(), schema: 2 } })).toBe('invalid');
    expect(await p.run({ kind: 'unavailable' })).toBe('unavailable');
    expect(p.reloads()).toBe(1);
    expect(
      await p.run({ kind: 'ok', body: { ...fixture(), critterdex: { found: 10, total: 150 } } }),
    ).toBe('written');
    expect(p.reloads()).toBe(2);
  });

  it('reports the placed widgets in the domain names, even when the snapshot is unavailable', async () => {
    const p = phone([
      { kind: 'CPCountdownWidget', family: 'system_small' },
      { kind: 'CPVoteWidget', family: 'system_medium' },
    ]);
    await p.run({ kind: 'unavailable' });
    expect(p.synced).toEqual([
      {
        widgets: [
          { kind: 'countdown', family: 'system_small' },
          { kind: 'vote', family: 'system_medium' },
        ],
      },
    ]);
  });

  it('names widgets only with kinds the domain knows, and drops the rest', () => {
    for (const kind of Object.values(WIDGET_KIND_BY_NATIVE)) expect(WIDGET_KINDS).toContain(kind);
    expect(
      installedWidgetsPayload([
        { kind: 'CPCountdownWidget', family: 'system_small' },
        { kind: 'CPCountdownWidget', family: 'system_small' },
        { kind: 'LeaveByStatusWidget', family: 'system_small' },
        { kind: 'CPCritterdexWidget', family: 'system_huge' },
      ]),
    ).toEqual({ widgets: [{ kind: 'countdown', family: 'system_small' }] });
  });

  it('keeps the Swift type the widgets decode in step with the contract', () => {
    expect(readFileSync(path.join(MOBILE, WIDGET_SNAPSHOT_SWIFT_FILE), 'utf8')).toBe(
      widgetSnapshotSwift(),
    );
  });
});
