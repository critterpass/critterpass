import { seasonReviewSummarySchema } from '@cp/domain';

import { defineAdminModule } from '../../kit/registry';
import { getJson } from '../../lib/api';
import { SeasonPage } from './season-page';

export const seasonModule = defineAdminModule({
  id: 'season',
  area: 'catalogue',
  label: 'Season review',
  order: 15,
  routes: [{ path: 'season', component: SeasonPage }],
  homeCounters: [
    {
      id: 'season-pending',
      label: 'Season items to review',
      to: '/season',
      load: async () => {
        const summary = await getJson('/v1/admin/season/summary', seasonReviewSummarySchema);
        return summary.pending_curves + summary.pending_events;
      },
    },
  ],
});
