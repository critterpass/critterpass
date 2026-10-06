import { defineAdminModule } from '../../kit/registry';
import { WorkPage } from './work-page';

export const workModule = defineAdminModule({
  id: 'work',
  area: 'work',
  label: 'My work',
  order: 1,
  routes: [{ path: 'work', component: WorkPage }],
});
