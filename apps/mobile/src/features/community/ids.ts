/** Wire values and toast ids the community screens use: never copy. */
/* eslint-disable lingui/no-unlocalized-strings -- ids and wire values, never copy. */
import type { ReportContentPayload } from '@cp/domain';

export const toastIds = {
  noTrip: (id: string) => `community-no-trip-${id}`,
  suggested: (id: string) => `community-suggest-${id}`,
  copied: (id: string) => `community-copied-${id}`,
  copyFailed: (id: string) => `community-copy-failed-${id}`,
  reported: (id: string) => `community-report-${id}`,
  link: (id: string) => `community-link-${id}`,
};

/** The organiser's draft review, where a copied plan's placing lands. */
export const DRAFT_REVIEW_SCREEN = '3c-9';

export function planReport(id: string): ReportContentPayload {
  return { kind: 'shared_plan', id, reason: 'other' };
}
