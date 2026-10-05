/**
 * The section 7 planning screens join the app here, imported once by the root layout after every
 * other feature's register. Append-only and union-merged: each planning phase adds one import
 * line for its own register module.
 */
import { startPlanHubFeed } from '@/data/plan/plan-hub-feed';
import '@/features/plan/add/register';
import '@/features/plan/ideas/register';
import '@/features/plan/review/register';
import '@/features/plan/check/register';

import './plan/hub/register';
import './explore/place-detail/register';
import './explore/split/register';
import '@/features/explore/search/register';
import './explore/places/register';
import '@/features/explore/trip-explore/register';

startPlanHubFeed();
