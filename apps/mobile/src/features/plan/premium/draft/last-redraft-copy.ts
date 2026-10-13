/** The words of the last free redraft's sheet that the plan area hosts. */
import { t } from '@lingui/core/macro';

export const lastRedraftCopy = {
  notNow: () => t({ id: 'plan.premium.draft.notNow', message: 'Not now' }),
  loading: () => t({ id: 'plan.premium.draft.loading', message: 'Loading the draft' }),
};
