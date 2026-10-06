import { defineAdminModule } from '../../kit/registry';
import { DriversPage } from './drivers-page';

export const driverDirectoryModule = defineAdminModule({
  id: 'driver-directory',
  area: 'community',
  label: 'Drivers',
  order: 35,
  routes: [{ path: 'drivers', component: DriversPage }],
});
