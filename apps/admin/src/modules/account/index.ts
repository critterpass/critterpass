import { defineAdminModule } from '../../kit/registry';
import { DeletionPanel } from './deletion-panel';
import { DeletionsPage } from './deletions-page';

export const accountModule = defineAdminModule({
  id: 'account',
  area: 'support',
  label: 'Account deletions',
  order: 61,
  routes: [{ path: 'deletions', component: DeletionsPage }],
  userPanels: [{ id: 'deletion', label: 'Deletion', component: DeletionPanel }],
});
