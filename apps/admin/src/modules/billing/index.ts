import { defineAdminModule } from '../../kit/registry';
import { BillingPage } from './billing-page';

export const billingModule = defineAdminModule({
  id: 'billing',
  area: 'billing',
  label: 'Billing',
  order: 75,
  routes: [{ path: 'billing', component: BillingPage }],
});
