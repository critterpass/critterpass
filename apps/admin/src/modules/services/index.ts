import { defineAdminModule } from '../../kit/registry';
import { ServicesPage } from './services-page';

export const servicesModule = defineAdminModule({
  id: 'services',
  area: 'services',
  label: 'Services & spend',
  order: 42,
  routes: [{ path: 'services', component: ServicesPage }],
});
