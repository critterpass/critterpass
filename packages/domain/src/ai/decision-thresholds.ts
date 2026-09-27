/**
 * Decision thresholds per route, tuned on that route's eval set against the pinned model
 * (`jev-1.13.0`, docs/decisions/20260927-jev-decision-model.md): a new Jev version needs a full
 * decision-eval run and re-tuned numbers here. Each route carries a band for Jev answers and a
 * stricter one for answers from its Haiku twin, whose values come from labels rather than
 * calibrated probabilities, so more of them land in the uncertain middle.
 *
 * A yes/no answer `p` is `yes` at or above `yes`, `no` at or below `no`, and `uncertain` between
 * them; a choice or score answer below `minConfidence` is `uncertain`. What an uncertain answer
 * does (ask the user, keep both ideas, stay quiet, send to review) is the consumer's rule.
 */
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

/** A Haiku twin answers yes/no only as definite or hedged labels; only definite ones decide. */
const HAIKU_BAND: DecisionBand = { yes: 0.9, no: 0.1, minConfidence: 0.8 };

export const DECISION_THRESHOLDS: Readonly<Record<DecisionRoute, DecisionThresholds>> = {
  // Runs on every crew message: an unsure chime-in stays quiet.
  'guide.chime_in_classifier': {
    jev: { yes: 0.7, no: 0.3, minConfidence: 0.5 },
    haiku: HAIKU_BAND,
  },
  // Below the confidence floor the help screen asks the user which topic they meant.
  'help.intent_classifier': {
    jev: { yes: 0.7, no: 0.3, minConfidence: 0.5 },
    haiku: HAIKU_BAND,
  },
  // The spike's gray zone (0.35–0.65) keeps both ideas instead of merging them.
  'idea.duplicate_tiebreak': {
    jev: { yes: 0.65, no: 0.35, minConfidence: 0.5 },
    haiku: HAIKU_BAND,
  },
  // Per surface and category bands live in COMPLIANCE_THRESHOLDS; this is the route default.
  'compliance.check': {
    jev: { yes: 0.85, no: 0.5, minConfidence: 0.5 },
    haiku: HAIKU_BAND,
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
