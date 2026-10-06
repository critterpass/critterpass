import { defineAdminModule } from '../../kit/registry';
import { IdeasPage } from './ideas-page';

export const helpModule = defineAdminModule({
  id: 'feedback',
  area: 'feedback',
  label: 'Feedback & ideas',
  order: 72,
  routes: [{ path: 'ideas', component: IdeasPage }],
});
