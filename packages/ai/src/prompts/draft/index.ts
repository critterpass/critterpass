// Drafting prompts: the trip outline, day plans and their repair, redrafts and the summary line.
export { clockText, gatewayModel, hoursOn, type DraftModel, type DraftPlanInput } from './context';
export { stopBudget } from './budget';
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
  type RepairOutcome,
} from './repair';
export { proseProblem } from './schema';
export {
  buildSkeletonRequest,
  normaliseSkeleton,
  runSkeleton,
  type SkeletonDay,
  type SkeletonPlan,
} from './skeleton';
export { templateSummary, writeDraftSummary, type SummaryInput } from './summary';
export { derivedUuid } from './ids';
