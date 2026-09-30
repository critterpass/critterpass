/**
 * Guide metering rules (docs/product-decisions.md D8, C12, C47): the free daily limit, which asks
 * are exempt, the queued question's guard and the proactive posting allowance. The atomic count is
 * `app.consume_quota`; these are the pure decisions around it.
 */

/** Free guide answers per device-local day (`ops_config guide.free_daily_limit` default). */
export const GUIDE_FREE_DAILY_LIMIT = 30;
/** Silent daily cap on unlimited tiers, one unit per guide turn. */
export const GUIDE_FAIR_USE_DAILY_CAP = 300;
/** The usage_counters metric every guide question (text, voice, camera, queued) spends. */
export const GUIDE_METER_METRIC = 'guide_answers';
/** fair_use_counters metric the unlimited tiers are counted under. */
export const GUIDE_FAIR_USE_METRIC = 'guide_tokens';

/** Proactive guide offers a crew may get per day (`ops_config guide.proactive.daily_cap`). */
export const GUIDE_PROACTIVE_DEFAULT_CAP = 3;
export const GUIDE_PROACTIVE_SWITCH = 'guide.proactive.enabled';
export const GUIDE_PROACTIVE_CAP_KEY = 'guide.proactive.daily_cap';

/** Guide work that never spends a user's meter (C12). */
export const GUIDE_UNMETERED_WORK = [
  'planning_job',
  'vote',
  'proposal',
  'proactive_post',
  'settings_sample',
] as const;

export interface UsageRow {
  readonly count: number;
  readonly limit: number;
}

/** A question may be queued only while today's free answers are spent (`QUOTA_EXHAUSTED`). */
export function canQueueQuestion(usage: UsageRow | undefined): boolean {
  return usage !== undefined && usage.count >= usage.limit;
}

export interface ProactiveAllowanceInput {
  readonly enabled: boolean;
  /** Offers already posted to this crew today. */
  readonly postedToday: number;
  readonly cap: number;
  /** Active members who set the guide to quiet, and all active members. */
  readonly quietMembers: number;
  readonly members: number;
}

/**
 * Whether the guide may chime in with one more offer: the kill switch is on, today's cap is not
 * spent, and the crew has not mostly asked the guide to stay quiet.
 */
export function proactiveAllowed(input: ProactiveAllowanceInput): boolean {
  if (!input.enabled || input.cap <= 0) return false;
  if (input.postedToday >= input.cap) return false;
  return input.members > 0 && input.quietMembers * 2 <= input.members;
}
