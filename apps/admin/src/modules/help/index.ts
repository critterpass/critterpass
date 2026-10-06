import { defineAdminModule } from '../../kit/registry';
import { FeedbackPage } from './feedback-page';
import { IdeasPage } from './ideas-page';

export const helpModule = defineAdminModule({
  id: 'feedback',
  area: 'feedback',
  label: 'Feedback & ideas',
  order: 72,
  routes: [
    { path: 'ideas', component: IdeasPage },
    { path: 'feedback', component: FeedbackPage },
  ],
});
