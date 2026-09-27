import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { APP_ICONS } from '../templates/app-icons';
import {
  SMALL_ICON_VIEWPORT,
  buildStampVectorDrawable,
  writeStampVectorDrawable,
} from './vector-drawable';

function stampCritterSpec() {
  const def = APP_ICONS.find((entry) => entry.id === 'stamp');
  if (!def) throw new Error('expected a "stamp" APP_ICONS entry');
  return {
    kind: def.character.kind,
    seed: def.character.seed,
    pose: def.character.pose,
    variant: 'mask' as const,
    maskColor: '#ffffff',
  };
}

describe('buildStampVectorDrawable', () => {
  it('produces a well-formed 24dp vector with a ring path (even-odd) and a critter silhouette path (non-zero)', () => {
    const xml = buildStampVectorDrawable({ critterSpec: stampCritterSpec() });

    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xml).toContain(`android:viewportWidth="${SMALL_ICON_VIEWPORT}"`);
    expect(xml).toContain(`android:viewportHeight="${SMALL_ICON_VIEWPORT}"`);

    const pathTags = [...xml.matchAll(/<path [^>]*\/>/g)].map((match) => match[0]);
    expect(pathTags).toHaveLength(2);

    const [ringPath, critterPath] = pathTags;
    expect(ringPath).toContain('android:fillType="evenOdd"');
    expect(critterPath).toContain('android:fillType="nonZero"');

    // Every path's pathData is non-empty and starts with a moveto, i.e. real geometry was emitted,
    // not an empty string swallowed by a bad Cmd walk.
    for (const path of pathTags) {
      const dataMatch = /android:pathData="([^"]+)"/.exec(path);
      expect(dataMatch?.[1]?.length ?? 0).toBeGreaterThan(10);
      expect(dataMatch?.[1]?.startsWith('M')).toBe(true);
    }
  });

  it('respects a custom viewport size', () => {
    const xml = buildStampVectorDrawable({ critterSpec: stampCritterSpec(), viewport: 48 });
    expect(xml).toContain('android:viewportWidth="48"');
    expect(xml).toContain('android:width="48dp"');
  });
});

describe('writeStampVectorDrawable', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes the XML to res/drawable/ic_stat_notification.xml', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-vector-drawable-'));
    writeStampVectorDrawable(dir, { critterSpec: stampCritterSpec() });

    const filePath = join(dir, 'drawable', 'ic_stat_notification.xml');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toContain('<vector');
  });
});
