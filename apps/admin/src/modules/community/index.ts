import { defineAdminModule } from '../../kit/registry';
import { SharedPlansPage } from './shared-plans-page';

export const communityModule = defineAdminModule({
  id: 'community',
  area: 'community',
  label: 'Shared plans',
  order: 34,
  routes: [{ path: 'shared-plans', component: SharedPlansPage }],
});
