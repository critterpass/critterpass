/**
 * `pnpm content places corrections --batch <key>`: builds a corrections batch from its decisions
 * (`data/place-corrections/<key>.json`) and the snapshot beside it, runs the places validators and
 * writes the release artifact and the review page. Nothing is queued: `review` does that.
 *
 * `--opt snapshot=1` (with `DATABASE_URL`) first re-reads the named records and their live items
 * from the database, read-only, and rewrites the snapshot.
 */
import path from 'node:path';

import { buildRelease } from '@cp/content';
import type pg from 'pg';

import { stageFiles } from '../../stages/state';
import { runValidators } from '../../validators/registry';
import { readJson, writeJson, writeText } from '../../work';
import {
  correctionCounts,
  correctionItems,
  correctionRefs,
  correctionsFileSchema,
  correctionsPaths,
  loadCorrections,
} from './corrections';
import { outOfReach } from './corrections-new-records';
import { renderCorrectionsReview } from './corrections-page';
import { snapshotRows } from './corrections-snapshot';
import { placesKind } from './pois';

export async function placeCorrectionsCommand(
  args: { batchKey: string; snapshot: boolean; pool: pg.Pool | null; now: Date },
  log: (line: string) => void,
): Promise<number> {
  const paths = correctionsPaths(args.batchKey);
  if (args.snapshot) {
    if (args.pool === null) throw new Error('the snapshot reads the database: set DATABASE_URL');
    const decisions = correctionsFileSchema.parse(readJson<unknown>(paths.corrections));
    const rows = await snapshotRows(
      args.pool,
      correctionRefs(decisions.places),
      new Set(decisions.new_records.map((record) => record.ref)),
    );
    writeJson(paths.before, { taken_at: args.now.toISOString(), rows });
    log(`corrections: snapshot of ${rows.length} records in ${paths.before}`);
  }
  const { file, before } = loadCorrections(args.batchKey);
  if (file.batch !== args.batchKey) throw new Error(`${paths.corrections} is for ${file.batch}`);
  const beyond = outOfReach(file.new_records);
  if (beyond.length > 0) throw new Error(beyond.join('; '));
  const items = correctionItems(file.places, before);
  const report = runValidators('places', items, placesKind.validators);
  for (const problem of report.batch) log(`  ${problem.severity}: ${problem.message}`);
  for (const item of report.items.filter((r) => r.severity === 'fail')) {
    log(`  fail ${item.ref}: ${item.checks.map((c) => c.message).join('; ')}`);
  }
  log(
    `corrections: ${report.counts.pass} pass · ${report.counts.warn} warn · ${report.counts.fail} fail`,
  );
  if (report.severity === 'fail') return 1;
  const files = stageFiles('places', args.batchKey);
  writeJson(
    files.paths.artifact,
    buildRelease({
      kind: 'places',
      version: 1,
      items,
      generated_by: {
        batch_key: args.batchKey,
        route: null,
        model: null,
        generated_at: file.checked_at,
      },
      approved_by: null,
    }),
  );
  const page = path.join(files.paths.dir, 'corrections.html');
  writeText(page, renderCorrectionsReview(file, before));
  for (const destination of new Set(file.places.map((place) => place.destination))) {
    const counts = correctionCounts(
      file.places.filter((place) => place.destination === destination),
      before,
    );
    log(
      `  ${destination}: ${counts.places} places · ${counts.merges} merges · ${counts.kindChanges} kinds · ${counts.movedPoints} moved points · ${counts.mustSees} must-sees · ${counts.essentials} essentials · ${counts.added} added`,
    );
  }
  log(`corrections: ${items.length} items in ${files.paths.artifact}; review ${page}`);
  return 0;
}
