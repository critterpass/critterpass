import { defineAdminModule } from '../../kit/registry';
import { CataloguePage } from './catalogue-page';

export const catalogueModule = defineAdminModule({
  id: 'catalogue',
  area: 'catalogue',
  label: 'Catalogue',
  order: 10,
  routes: [{ path: 'catalogue', component: CataloguePage }],
});
