/** Reading the fit route's answer for an organiser's own draft (./use-draft-fits.ts). */
import { placeFitSchema, type StoredFit } from '@cp/domain';

/** The route's answer as stored fits of `versionId`, by place; a fit the app can't read is left out. */
export function readDraftFits(
  body: unknown,
  versionId: string,
  now: Date,
): ReadonlyMap<string, StoredFit> {
  const fits = (body as { fits?: unknown } | null)?.fits;
  const read = new Map<string, StoredFit>();
  for (const raw of Array.isArray(fits) ? fits : []) {
    const parsed = placeFitSchema.safeParse(raw);
    if (!parsed.success || parsed.data.poi_id === null) continue;
    read.set(parsed.data.poi_id, {
      ...parsed.data,
      version_id: versionId,
      computed_at: now.toISOString(),
    });
  }
  return read;
}
