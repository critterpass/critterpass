import { defineAdminModule } from '../../kit/registry';
import { JobsPage } from './jobs-page';

export const jobsModule = defineAdminModule({
  id: 'jobs',
  area: 'jobs',
  label: 'Jobs & DLQ',
  order: 44,
  routes: [{ path: 'jobs', component: JobsPage }],
});
