/**
 * The plan check (docs/api-contracts-planning.md, plan check): a deterministic job that reads the
 * crew's plan after every change and stores what needs fixing and what is worth knowing
 * (`plan_checks`, `plan_check_issues`). Issues carry numbers and ids only; the app words them from
 * templates. A fix is either ops the app can apply in one tap, a screen that works the fix out
 * with the person, or nothing.
 */
import { z } from 'zod';

import { changeSetOpsSchema } from '../plan/change-set-ops';
import { clockTimeSchema, crowdReadSourceSchema, fitWeatherSourceSchema } from './fit';

export const PLAN_CHECK_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export const planCheckStatusSchema = z.enum(PLAN_CHECK_STATUSES);
export type PlanCheckStatus = z.infer<typeof planCheckStatusSchema>;

/** In rank order: fixes first, then by kind. */
export const CHECK_ISSUE_KINDS = [
  'clash',
  'closed',
  'too_far',
  'rain',
  'crowds',
  'pace',
  'booking_note',
] as const;
export const checkIssueKindSchema = z.enum(CHECK_ISSUE_KINDS);
export type CheckIssueKind = z.infer<typeof checkIssueKindSchema>;

export const CHECK_SEVERITIES = ['fix', 'know'] as const;
export const checkSeveritySchema = z.enum(CHECK_SEVERITIES);
export type CheckSeverity = z.infer<typeof checkSeveritySchema>;

export const FIX_SCREENS = ['less_driving', 'rain_crowds', 'fill_gap', 'too_far'] as const;
export const fixScreenSchema = z.enum(FIX_SCREENS);
export type FixScreen = z.infer<typeof fixScreenSchema>;

const minutes = z.number().int().min(0);
const percent = z.number().int().min(0).max(100);

/** The params each issue kind carries, keyed by kind. */
export const CHECK_ISSUE_PARAMS = {
  clash: z.strictObject({ first: z.uuid(), second: z.uuid(), short_minutes: minutes }),
  closed: z.strictObject({
    stable_id: z.uuid(),
    opens_at: clockTimeSchema.nullable(),
    closes_at: clockTimeSchema.nullable(),
    closed_all_day: z.boolean(),
  }),
  too_far: z.strictObject({
    drive_minutes: minutes,
    limit_minutes: minutes,
    longest_leg_minutes: minutes,
    after_dark: z.boolean(),
  }),
  rain: z.strictObject({
    stable_id: z.uuid(),
    from: clockTimeSchema,
    to: clockTimeSchema,
    pct: percent,
    source: fitWeatherSourceSchema,
  }),
  crowds: z.strictObject({
    stable_id: z.uuid(),
    level: percent,
    busy_from: clockTimeSchema,
    quiet_until: clockTimeSchema.nullable(),
    source: crowdReadSourceSchema,
  }),
  pace: z.strictObject({ stops: z.number().int().min(0), limit: z.number().int().min(1) }),
  booking_note: z.strictObject({
    booking_id: z.uuid(),
    deadline: z.iso.datetime({ offset: true }),
    kind: z.enum(['free_cancel', 'hold_expiry']),
  }),
} as const satisfies Record<CheckIssueKind, z.ZodType>;

export const checkFixSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('apply'), ops: changeSetOpsSchema.max(20) }),
  z.strictObject({ kind: z.literal('screen'), screen: fixScreenSchema }),
  z.strictObject({ kind: z.literal('none') }),
]);
export type CheckFix = z.infer<typeof checkFixSchema>;

const issueOf = <K extends CheckIssueKind>(kind: K) =>
  z.strictObject({
    kind: z.literal(kind),
    params: CHECK_ISSUE_PARAMS[kind],
  });

/** An issue's kind with the params that kind carries. */
export const checkIssueBodySchema = z.discriminatedUnion('kind', [
  issueOf('clash'),
  issueOf('closed'),
  issueOf('too_far'),
  issueOf('rain'),
  issueOf('crowds'),
  issueOf('pace'),
  issueOf('booking_note'),
]);
export type CheckIssueBody = z.infer<typeof checkIssueBodySchema>;

/** A `plan_check_issues` row as it syncs to the trip's crew. */
export const planCheckIssueSchema = z.intersection(
  checkIssueBodySchema,
  z.object({
    id: z.uuid(),
    trip_id: z.uuid(),
    version_id: z.uuid(),
    severity: checkSeveritySchema,
    day_id: z.uuid().nullable(),
    stable_ids: z.array(z.uuid()),
    fix: checkFixSchema.nullable(),
    rank: z.number().int().min(0),
    fingerprint: z.string().min(1).max(200),
  }),
);
export type PlanCheckIssue = z.infer<typeof planCheckIssueSchema>;

/** A `plan_checks` row: one per trip, the latest run. */
export const planCheckSchema = z.object({
  trip_id: z.uuid(),
  version_id: z.uuid().nullable(),
  status: planCheckStatusSchema,
  checked_at: z.iso.datetime({ offset: true }).nullable(),
  fix_count: z.number().int().min(0),
  know_count: z.number().int().min(0),
  runs_on: z.iso.date().nullable(),
  runs_today: z.number().int().min(0),
});
export type PlanCheck = z.infer<typeof planCheckSchema>;
