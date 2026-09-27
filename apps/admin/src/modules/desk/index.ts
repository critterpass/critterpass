import { deskSummarySchema } from '@cp/domain';

import { defineAdminModule } from '../../kit/registry';
import { getJson } from '../../lib/api';
import { DeskPage } from './desk-page';

export const deskModule = defineAdminModule({
  id: 'desk',
  area: 'desk',
  label: 'Ops desk',
  order: 70,
  routes: [{ path: 'desk', component: DeskPage }],
  homeCounters: [
    {
      id: 'desk-due-soon',
      label: 'Desk tasks due < 2 h',
      to: '/desk',
      warnAbove: 0,
      load: async () => (await getJson('/v1/admin/desk/summary', deskSummarySchema)).due_soon,
    },
  ],
});
