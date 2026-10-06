import { defineAdminModule } from '../../kit/registry';
import { OperatorsPage } from './operators-page';

export const operatorsModule = defineAdminModule({
  id: 'operators',
  area: 'operators',
  label: 'Operators',
  order: 95,
  routes: [{ path: 'operators', component: OperatorsPage }],
});
