import { costReviewSummarySchema } from '@cp/domain';

import { defineAdminModule } from '../../kit/registry';
import { getJson } from '../../lib/api';
import { CostsPage } from './costs-page';

export const costsModule = defineAdminModule({
  id: 'costs',
  area: 'catalogue',
  label: 'Cost indices',
  order: 16,
  routes: [{ path: 'costs', component: CostsPage }],
  homeCounters: [
    {
      id: 'costs-pending',
      label: 'Cost indices to review',
      to: '/costs',
      load: async () => (await getJson('/v1/admin/costs/summary', costReviewSummarySchema)).pending,
    },
  ],
});
