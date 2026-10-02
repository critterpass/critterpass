/**
 * The Swift type the widget extension decodes `snapshot/widgets.json` into, rendered from the
 * domain's zod contract (packages/domain `widgetSnapshotSchema`). A jest test fails when the
 * checked-in file drifts from the contract; regenerate:
 *
 *   pnpm --filter @cp/mobile exec tsx src/features/home/widget-gallery/snapshot-swift-source.ts --write
 */
/* eslint-disable lingui/no-unlocalized-strings -- build script: a file path and a Swift header. */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { renderSwiftDocument, widgetSnapshotSchema } from '@cp/domain';

/** Relative to apps/mobile. */
export const WIDGET_SNAPSHOT_SWIFT_FILE = 'targets/_shared/Snapshot/WidgetSnapshot.swift';

const HEADER = [
  '// Generated from packages/domain `widgetSnapshotSchema` by',
  '// src/features/home/widget-gallery/snapshot-swift-source.ts. Do not edit by hand.',
].join('\n');

export function widgetSnapshotSwift(): string {
  return renderSwiftDocument('WidgetSnapshot', widgetSnapshotSchema, 'WS', HEADER);
}

if (process.argv.includes('--write')) {
  const mobile = path.resolve(import.meta.dirname, '../../../..');
  writeFileSync(path.join(mobile, WIDGET_SNAPSHOT_SWIFT_FILE), widgetSnapshotSwift());
}
