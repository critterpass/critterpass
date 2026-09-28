import { contentBatchListSchema } from '@cp/domain';

import { defineAdminModule } from '../../kit/registry';
import { getJson } from '../../lib/api';
import { ContentPage } from './content-page';
import { HoursPage } from './hours-page';

export const contentModule = defineAdminModule({
  id: 'content',
  area: 'content',
  label: 'Content batches',
  order: 25,
  routes: [
    { path: 'content', component: ContentPage },
    { path: 'content/hours', component: HoursPage },
  ],
  homeCounters: [
    {
      id: 'content-review',
      label: 'Batches to review',
      to: '/content',
      load: async () =>
        (await getJson('/v1/admin/content/batches', contentBatchListSchema)).items.filter(
          (batch) => batch.status === 'review' || batch.status === 'blocked',
        ).length,
    },
  ],
});
