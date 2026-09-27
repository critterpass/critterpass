import { defineAdminModule } from '../../kit/registry';
import { SupportPage } from './support-page';
import { SupportUserPage } from './user-page';

export const supportModule = defineAdminModule({
  id: 'support',
  area: 'support',
  label: 'Support',
  order: 60,
  routes: [
    { path: 'support', component: SupportPage },
    { path: 'support/$uid', component: SupportUserPage },
  ],
});
