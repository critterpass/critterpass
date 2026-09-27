/**
 * Every console module, one line each. Areas built later (jobs, feedback, content batches) add
 * their `defineAdminModule` export here.
 */
import type { AdminModule } from '../kit/registry';
import { catalogueModule } from '../modules/catalogue';
import { deskModule } from '../modules/desk';
import { flagsModule } from '../modules/flags';
import { moderationModule } from '../modules/moderation';
import { partnersModule } from '../modules/partners';
import { supportModule } from '../modules/support';

export const ADMIN_MODULES: readonly AdminModule[] = [
  moderationModule,
  catalogueModule,
  flagsModule,
  partnersModule,
  supportModule,
  deskModule,
];
