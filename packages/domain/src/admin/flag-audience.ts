/**
 * Who a feature flag applies to (`set_feature_flag {key, value, audience}`). `all` flags project to
 * the synced `client_config` table; scoped flags stay server-side and are resolved per request with
 * `flagApplies`, so a cohort-only value never reaches every client.
 */
import { z } from 'zod';

const appVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, 'must be MAJOR.MINOR.PATCH');

export const flagAudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all') }).strict(),
  z.object({ kind: z.literal('cohort'), cohort: z.string().min(1).max(64) }).strict(),
  z.object({ kind: z.literal('uids'), uids: z.array(z.uuid()).min(1).max(500) }).strict(),
  z
    .object({
      kind: z.literal('app_version'),
      min: appVersionSchema.optional(),
      max: appVersionSchema.optional(),
    })
    .strict()
    .refine((range) => range.min !== undefined || range.max !== undefined, {
      message: 'min or max is required',
    }),
]);
export type FlagAudience = z.infer<typeof flagAudienceSchema>;

export const FLAG_AUDIENCE_ALL: FlagAudience = { kind: 'all' };

export interface FlagSubject {
  readonly uid: string;
  readonly cohorts: readonly string[];
  readonly appVersion: string | undefined;
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Whether a flag scoped to `audience` applies to `subject`; app-version bounds are inclusive. */
export function flagApplies(audience: FlagAudience, subject: FlagSubject): boolean {
  switch (audience.kind) {
    case 'all':
      return true;
    case 'cohort':
      return subject.cohorts.includes(audience.cohort);
    case 'uids':
      return audience.uids.includes(subject.uid);
    case 'app_version': {
      const version = subject.appVersion;
      if (version === undefined || !appVersionSchema.safeParse(version).success) return false;
      if (audience.min !== undefined && compareVersions(version, audience.min) < 0) return false;
      if (audience.max !== undefined && compareVersions(version, audience.max) > 0) return false;
      return true;
    }
  }
}
