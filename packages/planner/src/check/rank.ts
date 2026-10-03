/**
 * Issue order: what needs fixing before what is worth knowing, then by kind (a clash, then a
 * closure, a long drive, rain, crowds; a packed day, then a booking note), then day order.
 */
import { CHECK_ISSUE_KINDS } from '@cp/domain';

import { fingerprintOf } from './fingerprint';
import type { CheckIssueDraft, RankedIssue } from './types';

export function rankIssues(issues: readonly CheckIssueDraft[]): RankedIssue[] {
  return [...issues]
    .sort(
      (a, b) =>
        (a.severity === 'fix' ? 0 : 1) - (b.severity === 'fix' ? 0 : 1) ||
        CHECK_ISSUE_KINDS.indexOf(a.kind) - CHECK_ISSUE_KINDS.indexOf(b.kind) ||
        (a.dayNo ?? Number.MAX_SAFE_INTEGER) - (b.dayNo ?? Number.MAX_SAFE_INTEGER) ||
        fingerprintOf(a).localeCompare(fingerprintOf(b)),
    )
    .map((issue, rank) => ({ ...issue, rank, fingerprint: fingerprintOf(issue) }));
}
