/**
 * The section 7 planning screens join the app here, imported once by the root layout after every
 * other feature's register, so a planning registration replaces an earlier one for the same id.
 * Append-only and union-merged: each planning phase adds one import line for its own register
 * module. Re-pointing an earlier plan or places id (3d-*, 3e-*) is a switch-aware route registered
 * from the new screen's register module (`planningRedesign()` decides at navigation time), never
 * an edit to the earlier registration.
 */
import { startPlanningSwitchFeed } from '@/data/plan/switch-feed';
import '@/features/plan/add/register';
import '@/features/plan/ideas/register';

startPlanningSwitchFeed();
