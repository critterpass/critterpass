/**
 * The trip settings reads (docs/api-contracts-planning.md, routes): what new dates would do, and
 * what cancelling would do. Asked when the screen opens and again when the range changes; a failed
 * ask keeps the last good answer (offline shows the screen's own state).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import {
  cancelSummaryResultSchema,
  datesImpactResultSchema,
  type CancelSummaryResult,
  type DatesImpactResult,
} from '@cp/domain';

import { useFixerRead, type FixerRead } from '@/features/plan/check/data/fixer-api';

export function datesImpactPath(
  tripId: string,
  range: { readonly start: string; readonly end: string } | null,
): string | null {
  if (range === null) return null;
  const query = new URLSearchParams({ start: range.start, end: range.end });
  return `/v1/trips/${encodeURIComponent(tripId)}/dates-impact?${query.toString()}`;
}

function parseImpact(body: unknown): DatesImpactResult | null {
  const parsed = datesImpactResultSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function parseSummary(body: unknown): CancelSummaryResult | null {
  const parsed = cancelSummaryResultSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function useDatesImpact(
  tripId: string,
  range: { readonly start: string; readonly end: string } | null,
): FixerRead<DatesImpactResult> {
  return useFixerRead(datesImpactPath(tripId, range), null, parseImpact);
}

export function useCancelSummary(
  tripId: string,
  version: string | null,
): FixerRead<CancelSummaryResult> {
  return useFixerRead(
    `/v1/trips/${encodeURIComponent(tripId)}/cancel-summary`,
    version,
    parseSummary,
  );
}
