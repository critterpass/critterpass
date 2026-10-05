// Drafting prompts: the trip outline, day plans and their repair, redrafts and the summary line.
export {
  clockText,
  gatewayModel,
  hoursOn,
  type DraftModel,
  type DraftPlanInput,
  type HeldStop,
  type UntimedMustDo,
} from './context';
export { stopBudget } from './budget';
export { withHeldStops } from './held';
export { readsLocalNames, shownName } from './shown-names';
export { essentialsLeftOut, type EssentialGap, type EssentialLeftOut } from './essentials';
export { buildDayRequest, draftOneDay, toChoices, type DayContext } from './day';
export { draftDays, runDraftPlan, type DraftedDays, type DraftPlanResult } from './pipeline';
export {
  buildRedraftRequest,
  ownViolations,
  runRedraft,
  type ChatLine,
  type RedraftOutcome,
  type RedraftPlanInput,
} from './redraft';
export {
  MAX_REPAIR_LOOPS,
  requiredMustDoIds,
  validate,
  validateAndRepair,
  withFinalNotes,
  type RepairOutcome,
  type RepairPass,
} from './repair';
export { areasOf, hopCap } from './areas';
export { proseProblem } from './schema';
export {
  buildSkeletonRequest,
  normaliseSkeleton,
  runSkeleton,
  type SkeletonDay,
  type SkeletonPlan,
} from './skeleton';
export { longVisitsOf, templateSummary, writeDraftSummary, type SummaryInput } from './summary';
export { derivedUuid } from './ids';
export { withWishAnswers, wishOptions, type WishAnswer } from './wish-answers';
export {
  checkClosures,
  closureQueries,
  CLOSURES_ROUTE,
  type ClosureCheckDeps,
  type ClosureCheckInput,
} from './closures';
