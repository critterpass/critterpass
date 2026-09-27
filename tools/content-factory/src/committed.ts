/**
 * Items of a kind as the committed batches have them (batches/<kind>/*.json, later batches win per
 * item), for kinds built on another kind's output: windows and spawns read the forms, places read
 * the place index.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { itemRef, loadRelease, type ContentItem, type ContentKind } from '@cp/content';

import { FACTORY_DIR } from './work';

export function committedItems<K extends ContentKind>(
  kind: K,
  root = FACTORY_DIR,
): ContentItem<K>[] {
  const dir = path.join(root, 'batches', kind);
  if (!existsSync(dir)) return [];
  const merged = new Map<string, ContentItem<K>>();
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    const release = loadRelease(JSON.parse(readFileSync(path.join(dir, file), 'utf8')), kind);
    for (const item of release.items) merged.set(itemRef(kind, item), item);
  }
  return [...merged.values()];
}
