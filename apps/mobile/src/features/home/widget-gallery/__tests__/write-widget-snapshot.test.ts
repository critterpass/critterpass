/**
 * The App Group side of the widget snapshot: written whole with the entitlements file beside it,
 * the widgets reloaded once per change and never when only the clock moved.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { createWidgetSnapshotWriter, type WidgetSnapshotDocument } from '../write-widget-snapshot';

const fixture = (): WidgetSnapshotDocument =>
  JSON.parse(
    readFileSync(
      path.resolve(
        __dirname,
        '../../../../../targets/_shared/Snapshot/Tests/Fixtures/widgets.json',
      ),
      'utf8',
    ),
  ) as WidgetSnapshotDocument;

function sink() {
  const files = new Map<string, unknown>();
  let reloads = 0;
  return {
    files,
    reloads: () => reloads,
    port: {
      writeSnapshot: (key: string, json: string) => void files.set(key, JSON.parse(json)),
      reloadWidgets: () => void (reloads += 1),
    },
  };
}

describe('widget snapshot writer', () => {
  it('writes the snapshot and the entitlements file, then reloads the widgets once', () => {
    const s = sink();
    expect(createWidgetSnapshotWriter(s.port).write(fixture())).toBe('written');
    expect(s.files.get('widgets')).toMatchObject({ schema: 1, critterdex: { found: 9 } });
    expect(s.files.get('entitlements')).toEqual({
      schema: 1,
      generated_at: '2026-09-25T02:41:00.000Z',
      passPlus: false,
      boostedTripIds: [],
      boostExpiresAt: null,
    });
    expect(s.reloads()).toBe(1);
  });

  it('lists the boosted trip for the locked states', () => {
    const s = sink();
    createWidgetSnapshotWriter(s.port).write({
      ...fixture(),
      entitlements: { pass_plus: true, boost_active: true },
    });
    expect(s.files.get('entitlements')).toMatchObject({
      passPlus: true,
      boostedTripIds: ['0199a3c0-0000-7000-8000-00000000a001'],
    });
  });

  it('writes nothing when only the clock moved', () => {
    const s = sink();
    const writer = createWidgetSnapshotWriter(s.port);
    writer.write(fixture());
    expect(writer.write({ ...fixture(), generated_at: '2026-09-25T02:56:00.000Z' })).toBe(
      'unchanged',
    );
    expect(writer.write({ ...fixture(), schema: 1, trip: null })).toBe('written');
    expect(s.reloads()).toBe(2);
  });
});
