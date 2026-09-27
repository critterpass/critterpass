import { moderationSummarySchema } from '@cp/domain';

import { defineAdminModule } from '../../kit/registry';
import { getJson } from '../../lib/api';
import { ModerationPage } from './moderation-page';

export const moderationModule = defineAdminModule({
  id: 'moderation',
  area: 'moderation',
  label: 'Moderation',
  order: 50,
  routes: [{ path: 'moderation', component: ModerationPage }],
  homeCounters: [
    {
      id: 'moderation-open',
      label: 'Reports open',
      to: '/moderation',
      warnAbove: 20,
      load: async () =>
        (await getJson('/v1/admin/moderation/summary', moderationSummarySchema)).open,
    },
  ],
});
