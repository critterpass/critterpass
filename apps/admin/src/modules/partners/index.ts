import { defineAdminModule } from '../../kit/registry';
import { PartnersPage } from './partners-page';

export const partnersModule = defineAdminModule({
  id: 'partners',
  area: 'partners',
  label: 'Partners',
  order: 40,
  routes: [{ path: 'partners', component: PartnersPage }],
});
