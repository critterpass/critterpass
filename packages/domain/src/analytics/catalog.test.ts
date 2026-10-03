import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ANALYTICS_EVENT_NAMES,
  COMMON_PROP_KEYS,
  countBucket,
  getAnalyticsEventSchema,
  guardAnalyticsEvent,
  isForbiddenPropKey,
  track,
  userPid,
  type AnalyticsEventName,
} from './index';

/** Every event in the starter taxonomy, plus the server-side billing events. */
const TAXONOMY = [
  'link_clicked',
  'install_attributed',
  'invite_prefill_viewed',
  'invite_manifest_reached',
  'pass_issued',
  'onboarding_step',
  'account_saved',
  'permission_result',
  'permission_primer_shown',
  'location_session',
  'visit_recorded',
  'crew_created',
  'crew_joined',
  'invite_sent',
  'place_pitched',
  'ballot_cast',
  'poll_closed',
  'reveal_seen',
  'dates_locked',
  'budget_max_set',
  'budget_locked',
  'mustdo_added',
  'draft_completed',
  'redraft_decided',
  'plan_edited',
  'changeset_applied',
  'proposal_sent',
  'proposal_opened',
  'trailer_completed',
  'rsvp_changed',
  'boarded',
  'guide_question',
  'guide_answer',
  'guide_limit_hit',
  'changeset_from_chat',
  'booking_added',
  'expense_added',
  'receipt_scanned',
  'settled_all',
  'im_up',
  'alarm_snoozed',
  'offline_session',
  'disruption_resolved',
  'help_opened',
  'help_article_rated',
  'sos_triggered',
  'sos_resolved',
  'egg_hatched',
  'encounter_ended',
  'quest_completed',
  'recap_story_completed',
  'photos_uploaded',
  'plan_published',
  'paywall_shown',
  'purchase_completed',
  'quiet_no',
  'subscription_state_changed',
  'notification_delivered',
  'roundup_sent',
  'la_started',
  'widget_action',
  'llm_call',
  'job_failed',
  'outbox_conflict',
  'purchase_refunded',
  'trial_converted',
  'referral_qualified',
  'cta_clicked',
] as const;

const UUID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

/** A valid sample value for a leaf schema, derived from the schema itself. */
function sample(schema: z.ZodType): unknown {
  if (schema instanceof z.ZodOptional) return sample(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodEnum) return schema.options[0];
  if (schema instanceof z.ZodBoolean) return true;
  if (schema instanceof z.ZodNumber) return 3;
  if (schema instanceof z.ZodUUID) return UUID;
  if (schema instanceof z.ZodString) {
    return ['some_key', 'EUR', 'claude-haiku-4-5'].find((value) => schema.safeParse(value).success);
  }
  throw new Error(`no sample for ${schema.constructor.name}`);
}

function sampleProps(name: AnalyticsEventName): Record<string, unknown> {
  const shape = getAnalyticsEventSchema(name).shape as Record<string, z.ZodType>;
  return Object.fromEntries(
    Object.entries(shape)
      .filter(
        ([key, schema]) =>
          !(schema instanceof z.ZodOptional) || !(COMMON_PROP_KEYS as string[]).includes(key),
      )
      .map(([key, schema]) => [key, sample(schema)]),
  );
}

describe('analytics catalog', () => {
  it('defines every taxonomy event and nothing it does not know about', () => {
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual([...TAXONOMY].sort());
  });

  it.each(ANALYTICS_EVENT_NAMES)('%s parses a valid sample with common props', (name) => {
    const props = { ...sampleProps(name), trip_id: UUID, surface: 'app', platform: 'ios' };
    expect(guardAnalyticsEvent(name, props)).toMatchObject({ ok: true, event: name });
  });

  it('keeps every catalog key clear of the forbidden patterns', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      for (const key of Object.keys(getAnalyticsEventSchema(name).shape)) {
        expect(isForbiddenPropKey(key), `${name}.${key}`).toBe(false);
      }
    }
  });

  it('allows no unconstrained string prop anywhere in the catalog', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      const shape = getAnalyticsEventSchema(name).shape as Record<string, z.ZodType>;
      for (const [key, raw] of Object.entries(shape)) {
        const schema = raw instanceof z.ZodOptional ? (raw.unwrap() as z.ZodType) : raw;
        if (schema instanceof z.ZodString && !(schema instanceof z.ZodUUID)) {
          expect(schema.def.checks?.length ?? 0, `${name}.${key}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('guardAnalyticsEvent', () => {
  it('rejects events outside the catalog', () => {
    expect(guardAnalyticsEvent('user_signed_up', {})).toMatchObject({ reason: 'unknown_event' });
  });

  it.each(['name', 'email', 'phone', 'lat', 'lng', 'budget_amount', 'text', 'dietary', 'age'])(
    'rejects forbidden key %s',
    (key) => {
      expect(guardAnalyticsEvent('crew_created', { [key]: 'x' })).toMatchObject({
        ok: false,
        reason: 'forbidden_key',
        detail: key,
      });
    },
  );

  it('rejects unknown keys and free-text values', () => {
    expect(guardAnalyticsEvent('crew_created', { vibe: 'chill' })).toMatchObject({
      reason: 'invalid_props',
    });
    expect(
      guardAnalyticsEvent('help_opened', { entry: 'I lost my passport in Hanoi' }),
    ).toMatchObject({ reason: 'invalid_props', detail: 'entry' });
    expect(guardAnalyticsEvent('ballot_cast', { poll_kind: 'anything' })).toMatchObject({
      reason: 'invalid_props',
    });
  });

  it('builds typed events', () => {
    expect(track('ballot_cast', { poll_kind: 'place', surface: 'widget' })).toEqual({
      event: 'ballot_cast',
      properties: { poll_kind: 'place', surface: 'widget' },
    });
  });
});

describe('helpers', () => {
  it('buckets counts', () => {
    expect([0, 1, 4, 9, 20, 40, 99].map(countBucket)).toEqual([
      '0',
      '1',
      '2-5',
      '6-10',
      '11-25',
      '26-50',
      '51+',
    ]);
  });

  it('derives a stable pid that is not the uid', async () => {
    const salt = 'a-long-enough-analytics-salt';
    const pid = await userPid(UUID, salt);
    expect(pid).toMatch(/^[0-9a-f]{64}$/u);
    expect(await userPid(UUID, salt)).toBe(pid);
    expect(await userPid(UUID, `${salt}-2`)).not.toBe(pid);
    await expect(userPid(UUID, 'short')).rejects.toThrow(/salt/u);
  });
});
