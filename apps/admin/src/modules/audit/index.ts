import { defineAdminModule } from '../../kit/registry';
import { AuditPage } from './audit-page';

export const auditModule = defineAdminModule({
  id: 'audit',
  area: 'audit',
  label: 'Audit log',
  order: 90,
  routes: [{ path: 'audit', component: AuditPage }],
});
