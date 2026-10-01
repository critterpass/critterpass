/**
 * The Swift `ActivityAttributes` source both the app module and the widget extension compile (see
 * ./activity-attributes.ts, which writes it), rendered from the domain's zod contracts.
 */
/* eslint-disable lingui/no-unlocalized-strings -- build script: file paths and a Swift header. */
import { LA_SWIFT_TYPES, renderLaSwift } from '@cp/domain';

const HEADER = [
  '// Generated from packages/domain Live Activity contracts by',
  '// src/features/trip/live-activities/test-support/activity-attributes.ts. Do not edit by hand.',
].join('\n');

/** Where the copies live, relative to apps/mobile. */
export const ACTIVITY_ATTRIBUTES_FILES = [
  'modules/cp-live-activity/ios/CPActivityAttributes.swift',
  'targets/_shared/ActivityAttributes/CPActivityAttributes.swift',
] as const;

export function activityAttributesSwift(): string {
  return renderLaSwift(LA_SWIFT_TYPES, HEADER);
}
