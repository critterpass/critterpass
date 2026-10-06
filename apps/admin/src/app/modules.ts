/**
 * Every console module, one line each. Areas built later (jobs, feedback, content batches) add
 * their `defineAdminModule` export here; `defineAdminModule` in ../kit/registry.ts shows one.
 */
import type { AdminModule } from '../kit/registry';
import { accountModule } from '../modules/account';
import { auditModule } from '../modules/audit';
import { billingModule } from '../modules/billing';
import { catalogueModule } from '../modules/catalogue';
import { contentModule } from '../modules/content';
import { costsModule } from '../modules/costs';
import { deskModule } from '../modules/desk';
import { flagsModule } from '../modules/flags';
import { helpModule } from '../modules/help';
import { jobsModule } from '../modules/jobs';
import { moderationModule } from '../modules/moderation';
import { operatorsModule } from '../modules/operators';
import { partnersModule } from '../modules/partners';
import { seasonModule } from '../modules/season';
import { servicesModule } from '../modules/services';
import { supportModule } from '../modules/support';
import { vendorDeskModule } from '../modules/vendor-desk';
import { workModule } from '../modules/work';

export const ADMIN_MODULES: readonly AdminModule[] = [
  workModule,
  moderationModule,
  catalogueModule,
  seasonModule,
  costsModule,
  contentModule,
  flagsModule,
  partnersModule,
  servicesModule,
  jobsModule,
  supportModule,
  accountModule,
  deskModule,
  vendorDeskModule,
  helpModule,
  billingModule,
  auditModule,
  operatorsModule,
];
