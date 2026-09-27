import { defineAdminModule } from '../../kit/registry';
import { FlagsPage } from './flags-page';

export const flagsModule = defineAdminModule({
  id: 'flags',
  area: 'flags',
  label: 'Flags & config',
  order: 30,
  routes: [{ path: 'flags', component: FlagsPage }],
});
