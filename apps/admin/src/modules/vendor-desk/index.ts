import { vendorDeskListSchema } from '@cp/domain';

import { defineAdminModule } from '../../kit/registry';
import { getJson } from '../../lib/api';
import { VendorDeskPage } from './vendor-desk-page';

export const vendorDeskModule = defineAdminModule({
  id: 'vendor-desk',
  area: 'desk',
  label: 'Vendor desk',
  order: 71,
  routes: [{ path: 'vendor-desk', component: VendorDeskPage }],
  homeCounters: [
    {
      id: 'vendor-desk-to-send',
      label: 'Approved texts to send',
      to: '/vendor-desk',
      warnAbove: 0,
      load: async () =>
        (await getJson('/v1/admin/vendor-desk?view=to_send', vendorDeskListSchema)).items.length,
    },
  ],
});
