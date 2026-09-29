// The destination vote's AI: the guide pitch and the guest guide's place brief.
export {
  buildPitchRequest,
  describeFacts,
  parsePitchLine,
  PITCH_PROMPT_VERSION,
  PITCH_ROUTE,
  pitchPersona,
  streamPitch,
  templatePitch,
  type PitchModelSection,
} from './pitch/prompt';
export {
  buildGuestBriefRequest,
  checkGuestFact,
  crewSizeBucket,
  GUEST_BRIEF_PROMPT_VERSION,
  GUEST_BRIEF_ROUTE,
  GUEST_FACT_ICONS,
  parseGuestFact,
  searchGuestSources,
  streamGuestBrief,
  type GuestBriefPlace,
  type GuestBriefSource,
  type GuestFact,
  type GuestFactIcon,
  type GuestFactProblem,
} from './guest-brief/prompt';
export { allowedDomainOf, GUEST_BRIEF_DOMAINS } from './guest-brief/domains';
