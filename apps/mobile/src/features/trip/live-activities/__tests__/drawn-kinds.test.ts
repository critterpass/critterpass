/**
 * The app tells the server it can draw every kind its native module bridges (`drawnKinds`), and
 * the server then push-starts those kinds on the phone. A kind with no view in the widget
 * extension would start as a blank activity, so every bridged kind must have its
 * `ActivityConfiguration` in targets/widgets.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { LA_KIND_SPECS, laKindSchema } from '@cp/domain';

const MOBILE = path.resolve(__dirname, '../../../../..');

function swiftUnder(dir: string): string {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.swift'))
    .map((entry) => readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');
}

describe('kinds the build says it draws', () => {
  const bridges = [
    ...readFileSync(
      path.join(MOBILE, 'modules/cp-live-activity/ios/LiveActivityKinds.swift'),
      'utf8',
    ).matchAll(/ActivityKindBridge<(\w+)>\(kind: "(\w+)"\)/g),
  ].map((match) => ({ type: match[1] ?? '', kind: match[2] ?? '' }));
  const widgets = swiftUnder(path.join(MOBILE, 'targets/widgets'));

  it('bridges each kind under the attributes type the server names in a push-to-start', () => {
    expect(bridges.length).toBeGreaterThan(0);
    for (const { type, kind } of bridges) {
      expect({ kind, type }).toEqual({
        kind,
        type: LA_KIND_SPECS[laKindSchema.parse(kind)].attributesType,
      });
    }
  });

  it('has a view in the widget extension for every kind it bridges', () => {
    const missing = bridges
      .filter(({ type }) => !widgets.includes(`ActivityConfiguration(for: ${type}.self)`))
      .map(({ kind }) => kind);
    expect(missing).toEqual([]);
  });
});
