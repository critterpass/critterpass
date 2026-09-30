/**
 * Every console module, one line each. Areas built later (jobs, feedback, content batches) add
 * their `defineAdminModule` export here; `defineAdminModule` in ../kit/registry.ts shows one.
 */
import type { AdminModule } from '../kit/registry';
import { auditModule } from '../modules/audit';
import { billingModule } from '../modules/billing';
import { catalogueModule } from '../modules/catalogue';
import { contentModule } from '../modules/content';
import { costsModule } from '../modules/costs';
import { deskModule } from '../modules/desk';
import { flagsModule } from '../modules/flags';
import { moderationModule } from '../modules/moderation';
import { partnersModule } from '../modules/partners';
import { seasonModule } from '../modules/season';
import { supportModule } from '../modules/support';

export const ADMIN_MODULES: readonly AdminModule[] = [
  moderationModule,
  catalogueModule,
  seasonModule,
  costsModule,
  contentModule,
  flagsModule,
  partnersModule,
  supportModule,
  deskModule,
  billingModule,
  auditModule,
];
