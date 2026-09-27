/**
 * Meter/counter vocabularies (docs/data-model.md §3.14 `usage_counters`, `fair_use_counters`).
 * Closed for the metrics this phase implements a real counting path for; a later phase wiring a new
 * metric (e.g. crew-chat messages, album bytes) extends these arrays plus the matching CHECK
 * constraint via an expand migration (same pattern as `domain_events_type_check`) rather than
 * loosening the check to an open string.
 */
import { z } from 'zod';

/** `usage_counters.subject_kind`: whose quota this row counts against. */
export const ENTITLEMENT_SUBJECT_KINDS = ['user', 'trip'] as const;
export const entitlementSubjectKindSchema = z.enum(ENTITLEMENT_SUBJECT_KINDS);
export type EntitlementSubjectKind = z.infer<typeof entitlementSubjectKindSchema>;

/** `usage_counters.metric`: visible, per-period quotas with a hard "used < limit" gate. */
export const USAGE_METRICS = ['guide_answers', 'redrafts', 'map_opens'] as const;
export const usageMetricSchema = z.enum(USAGE_METRICS);
export type UsageMetric = z.infer<typeof usageMetricSchema>;

/** `fair_use_counters.metric`: silent, never-shown caps that degrade rather than block. */
export const FAIR_USE_METRICS = ['guide_tokens', 'voice_seconds', 'vision_calls'] as const;
export const fairUseMetricSchema = z.enum(FAIR_USE_METRICS);
export type FairUseMetric = z.infer<typeof fairUseMetricSchema>;
