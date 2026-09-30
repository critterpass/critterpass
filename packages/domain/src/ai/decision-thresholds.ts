/**
 * Decision thresholds per route, tuned on that route's eval set against the pinned model
 * (`jev-1.13.0`, docs/decisions/20260927-jev-decision-model.md): a new Jev version needs a full
 * decision-eval run and re-tuned numbers here. Each route carries a band for Jev answers and a
 * stricter one for answers from its fast-tier twin, whose values come from labels rather than
 * calibrated probabilities, so more of them land in the uncertain middle.
 *
 * A yes/no answer `p` is `yes` at or above `yes`, `no` at or below `no`, and `uncertain` between
 * them; a choice or score answer below `minConfidence` is `uncertain`. What an uncertain answer
 * does (ask the user, keep both ideas, stay quiet, send to review) is the consumer's rule.
 */
import type { ComplianceCategory, ComplianceSurface } from './compliance';
import type { DecisionAnswerer, DecisionRoute } from './routes';

export interface DecisionBand {
  /** Yes/no answers at or above this probability read as yes. */
  readonly yes: number;
  /** Yes/no answers at or below this probability read as no. */
  readonly no: number;
  /** Choice and score answers below this confidence read as uncertain. */
  readonly minConfidence: number;
}

export type DecisionThresholds = Readonly<Record<DecisionAnswerer, DecisionBand>>;

export type YesNoVerdict = 'yes' | 'no' | 'uncertain';

/** The twin answers yes/no only as definite or hedged labels; only definite ones decide. */
const TWIN_BAND: DecisionBand = { yes: 0.9, no: 0.1, minConfidence: 0.8 };

export const DECISION_THRESHOLDS: Readonly<Record<DecisionRoute, DecisionThresholds>> = {
  // Runs on every crew message: an unsure chime-in stays quiet.
  'guide.chime_in_classifier': {
    jev: { yes: 0.7, no: 0.3, minConfidence: 0.5 },
    fast: TWIN_BAND,
  },
  // Below the confidence floor the help screen asks the user which topic they meant.
  'help.intent_classifier': {
    jev: { yes: 0.7, no: 0.3, minConfidence: 0.5 },
    fast: TWIN_BAND,
  },
  // The spike's gray zone (0.35–0.65) keeps both ideas instead of merging them.
  'idea.duplicate_tiebreak': {
    jev: { yes: 0.65, no: 0.35, minConfidence: 0.5 },
    fast: TWIN_BAND,
  },
  // Two nearby POIs with different names (often two languages): a sure yes merges them, the gray
  // band goes to a person in the places review batch.
  'poi.duplicate_tiebreak': {
    jev: { yes: 0.65, no: 0.35, minConfidence: 0.5 },
    fast: TWIN_BAND,
  },
  // Outcomes come from the per surface and category bands in COMPLIANCE_THRESHOLDS.
  'compliance.check': {
    jev: { yes: 0.85, no: 0.3, minConfidence: 0.5 },
    fast: TWIN_BAND,
  },
  // A written reply to the guide's private availability ask: below the floor the ask stays open
  // and the member is shown the two quick replies again.
  'availability.reply_intent': {
    jev: { yes: 0.7, no: 0.3, minConfidence: 0.6 },
    fast: TWIN_BAND,
  },
  // A place's WhatsApp reply to the desk: below the floor a person at the desk reads it, and the
  // traveller's card shows the reply verbatim without a yes or no.
  'vendor.reply_intent': {
    jev: { yes: 0.7, no: 0.3, minConfidence: 0.7 },
    fast: TWIN_BAND,
  },
};

export function decisionBand(route: DecisionRoute, answeredBy: DecisionAnswerer): DecisionBand {
  return DECISION_THRESHOLDS[route][answeredBy];
}

export function yesNoVerdict(p: number, band: DecisionBand): YesNoVerdict {
  if (p >= band.yes) return 'yes';
  if (p <= band.no) return 'no';
  return 'uncertain';
}

export function isConfident(confidence: number, band: DecisionBand): boolean {
  return confidence >= band.minConfidence;
}

/** A category's probability at or above `review` flags it; at or above `reject` rejects the text. */
export interface ComplianceBand {
  readonly review: number;
  /** `null`: this surface never rejects on the category, it only flags. */
  readonly reject: number | null;
}

export type ComplianceBands = Readonly<Record<DecisionAnswerer, ComplianceBand>>;

const band = (review: number, reject: number | null): ComplianceBands => ({
  jev: { review, reject },
  // Twin labels: only a definite `yes` (1) rejects; `unsure` (0.5) and above go to review.
  fast: { review: 0.5, reject: reject === null ? null : 1 },
});

/**
 * Per surface × category bands for `compliance.check`, tuned on the compliance eval set
 * (packages/ai/evals/compliance, EN + VI) against `jev-1.13.0`.
 */
export const COMPLIANCE_THRESHOLDS: Readonly<
  Record<ComplianceSurface, Partial<Record<ComplianceCategory, ComplianceBands>>>
> = {
  guide_input: {
    prompt_injection: band(0.5, null),
    self_harm: band(0.5, null),
    violence: band(0.5, null),
    harassment: band(0.5, null),
  },
  imported_text: {
    prompt_injection: band(0.5, null),
  },
  public_text: {
    prompt_injection: band(0.5, 0.85),
    harassment: band(0.5, 0.85),
    sexual: band(0.5, 0.85),
    self_harm: band(0.5, null),
    violence: band(0.5, 0.85),
    illegal: band(0.5, 0.85),
    personal_info: band(0.5, 0.85),
    promotion: band(0.5, 0.85),
  },
  outbound_text: {
    harassment: band(0.5, null),
    sexual: band(0.5, null),
    illegal: band(0.5, null),
    personal_info: band(0.5, null),
  },
};
