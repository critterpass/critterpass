import { defineAdminModule } from '../../kit/registry';
import { SharedPlansPage } from './shared-plans-page';

export const communityModule = defineAdminModule({
  id: 'community',
  area: 'community',
  label: 'Community & drivers',
  order: 45,
  routes: [{ path: 'community', component: SharedPlansPage }],
});
