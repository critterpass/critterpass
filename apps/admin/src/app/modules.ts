/**
 * Every console module, one line each. Areas built later (jobs, moderation, support, desk,
 * feedback, content batches, audit) add their `defineAdminModule` export here.
 */
import type { AdminModule } from '../kit/registry';
import { catalogueModule } from '../modules/catalogue';
import { flagsModule } from '../modules/flags';
import { partnersModule } from '../modules/partners';

export const ADMIN_MODULES: readonly AdminModule[] = [catalogueModule, flagsModule, partnersModule];
