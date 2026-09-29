/** "1 of 3 redrafts used"; nothing on an unlimited trip. */
import { t } from '@lingui/core/macro';

import type { RedraftQuota } from './quota';

export function counterLine(quota: RedraftQuota): string | null {
  if (quota.limit === null) return null;
  const used = quota.used;
  const limit = quota.limit;
  return t({ id: 'planDraft.counter', message: `${used} of ${limit} redrafts used` });
}
