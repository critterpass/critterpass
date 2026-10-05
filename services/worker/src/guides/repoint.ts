/**
 * Moves trips that have not started to the guide of their city, once guides are assigned per
 * city. Safe to run again: a trip already on its city's guide is left alone, and trips under way
 * or over are never touched. Logs counts only.
 */
import { repointTripGuides, withSystem, type RepointResult } from '@cp/db';
import type pg from 'pg';

export interface RepointGuidesOptions {
  /** Count the trips that would move and write nothing. */
  readonly dryRun?: boolean;
  readonly log?: (line: string) => void;
}

export async function repointGuides(
  pool: pg.Pool,
  options: RepointGuidesOptions = {},
): Promise<RepointResult> {
  const dryRun = options.dryRun === true;
  const result = await withSystem(pool, (tx) => repointTripGuides(tx, { dryRun }));
  const log = options.log ?? console.log;
  log(
    result.perCity
      ? `guides.repoint: ${result.moved} trips ${dryRun ? 'would move' : 'moved'} to their city's guide`
      : 'guides.repoint: guides.per_city is off, nothing moved',
  );
  return result;
}
