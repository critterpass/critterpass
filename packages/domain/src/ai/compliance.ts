/**
 * Input compliance check (docs/api-contracts.md §6, docs/decisions/20260927-jev-decision-model.md):
 * one screen of user or imported text per surface, returning `pass | review | reject` with the
 * categories that tripped. This module is the policy: categories, which surface screens which,
 * the deterministic patterns code catches before any model call, and how probabilities become an
 * outcome. The model call itself lives in `packages/ai` (`checkCompliance`).
 *
 * Surfaces:
 * - `guide_input` (guide chat, mentions, voice transcripts) never blocks: a flag removes write
 *   tools for the turn (injection) or adds the Help safety card (self-harm, violence).
 * - `imported_text` (forwarded emails, receipt OCR, vendor replies) is a signal: a flagged import
 *   needs the user's confirm before any auto-action.
 * - `public_text` (tips, shared-plan notes, photo captions, idea board) screens every category and
 *   fails closed: rejected text is `CONTENT_REJECTED`, uncertain text waits in moderation review.
 * - `outbound_text` (vendor drafts from the ops desk) is never auto-sent when flagged.
 */
import { z } from 'zod';

import { COMPLIANCE_THRESHOLDS } from './decision-thresholds';

export const COMPLIANCE_CATEGORIES = [
  'prompt_injection',
  'harassment',
  'sexual',
  'self_harm',
  'violence',
  'illegal',
  'personal_info',
  'promotion',
] as const;
export const complianceCategorySchema = z.enum(COMPLIANCE_CATEGORIES);
export type ComplianceCategory = z.infer<typeof complianceCategorySchema>;

export const COMPLIANCE_SURFACES = [
  'guide_input',
  'imported_text',
  'public_text',
  'outbound_text',
] as const;
export const complianceSurfaceSchema = z.enum(COMPLIANCE_SURFACES);
export type ComplianceSurface = z.infer<typeof complianceSurfaceSchema>;

export const COMPLIANCE_OUTCOMES = ['pass', 'review', 'reject'] as const;
export type ComplianceOutcome = (typeof COMPLIANCE_OUTCOMES)[number];

/** Who produced the verdict: Jev, the Haiku twin, code patterns alone, or nobody (both down). */
export const COMPLIANCE_ANSWERERS = ['jev', 'haiku', 'code', 'none'] as const;
export type ComplianceAnswerer = (typeof COMPLIANCE_ANSWERERS)[number];

export interface ComplianceFlag {
  readonly category: ComplianceCategory;
  /** Probability the text is in the category (1 for a code pattern match). */
  readonly p: number;
}

export interface ComplianceResult {
  readonly outcome: ComplianceOutcome;
  /** Categories at or above the surface's review threshold, highest first. */
  readonly flags: readonly ComplianceFlag[];
  readonly answered_by: ComplianceAnswerer;
}

export const SURFACE_CATEGORIES: Readonly<
  Record<ComplianceSurface, readonly ComplianceCategory[]>
> = {
  guide_input: ['prompt_injection', 'self_harm', 'violence', 'harassment'],
  imported_text: ['prompt_injection'],
  public_text: COMPLIANCE_CATEGORIES,
  outbound_text: ['harassment', 'sexual', 'illegal', 'personal_info'],
};

/** The outcome when neither Jev nor the Haiku twin answered. */
export const UNAVAILABLE_OUTCOME: Readonly<Record<ComplianceSurface, ComplianceOutcome>> = {
  // The question is never blocked; the turn still runs with its untrusted text wrapped.
  guide_input: 'pass',
  // Unchecked imports and drafts wait for a person, as flagged ones do.
  imported_text: 'review',
  outbound_text: 'review',
  // Fail closed.
  public_text: 'review',
};

// Deterministic patterns: exact, free and checked before any model call.
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u;
const URL =
  /\b(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+\.(?:com|net|org|vn|io|co|me|info|biz|link|ly)(?:\/\S*)?\b/iu;
/** A leading + or 0 then 8–13 more digits, split by spaces, dots or dashes (prices never lead with 0). */
const PHONE = /(?:\+\d|\b0\d)(?:[\s.-]?\d){7,12}\b/u;
/** Passport numbers (a letter then 7–8 digits). */
const PASSPORT = /\b[A-Z]\d{7,8}\b/u;
const CARD_CANDIDATE = /\b\d(?:[\s-]?\d){12,18}\b/gu;

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export type CompliancePattern = 'email' | 'phone' | 'url' | 'card' | 'passport';

export function detectPatterns(text: string): CompliancePattern[] {
  const found: CompliancePattern[] = [];
  if (EMAIL.test(text)) found.push('email');
  const cards = [...text.matchAll(CARD_CANDIDATE)].map((m) => m[0].replace(/\D/gu, ''));
  if (cards.some((digits) => digits.length >= 13 && luhnValid(digits))) found.push('card');
  else if (PHONE.test(text)) found.push('phone');
  if (PASSPORT.test(text)) found.push('passport');
  if (URL.test(text.replace(EMAIL, ' '))) found.push('url');
  return found;
}

/** What a pattern match says: contact details and ID numbers are personal info, links promotion. */
const PATTERN_CATEGORY: Readonly<Record<CompliancePattern, ComplianceCategory>> = {
  email: 'personal_info',
  phone: 'personal_info',
  card: 'personal_info',
  passport: 'personal_info',
  url: 'promotion',
};

/**
 * How sure a match is: contact details and ID numbers are certain; a link alone is only suspect
 * (an official site is fine), so it sits in the review band and the model judges the promotion.
 */
const PATTERN_P: Readonly<Record<CompliancePattern, number>> = {
  email: 1,
  phone: 1,
  card: 1,
  passport: 1,
  url: 0.7,
};

/** Pattern flags for the categories a surface screens. */
export function patternFlags(surface: ComplianceSurface, text: string): ComplianceFlag[] {
  const screened = new Set(SURFACE_CATEGORIES[surface]);
  return mergeFlags(
    detectPatterns(text)
      .filter((pattern) => screened.has(PATTERN_CATEGORY[pattern]))
      .map((pattern) => ({ category: PATTERN_CATEGORY[pattern], p: PATTERN_P[pattern] })),
  );
}

/** Highest probability per category across flag lists. */
export function mergeFlags(...lists: readonly (readonly ComplianceFlag[])[]): ComplianceFlag[] {
  const best = new Map<ComplianceCategory, number>();
  for (const flag of lists.flat()) {
    best.set(flag.category, Math.max(best.get(flag.category) ?? 0, flag.p));
  }
  return [...best].map(([category, p]) => ({ category, p })).sort((a, b) => b.p - a.p);
}

/**
 * Maps category probabilities to the surface outcome. `answeredBy` picks the band: a Haiku-twin
 * verdict uses the stricter one; code pattern flags use Jev's. Returns the flagged categories only.
 */
export function complianceOutcome(
  surface: ComplianceSurface,
  scores: readonly ComplianceFlag[],
  answeredBy: 'jev' | 'haiku',
): { readonly outcome: ComplianceOutcome; readonly flags: ComplianceFlag[] } {
  const bands = COMPLIANCE_THRESHOLDS[surface];
  let outcome: ComplianceOutcome = 'pass';
  const flags: ComplianceFlag[] = [];
  for (const flag of mergeFlags(scores)) {
    const band = bands[flag.category]?.[answeredBy];
    if (band === undefined) continue;
    if (band.reject !== null && flag.p >= band.reject) outcome = 'reject';
    if (flag.p >= band.review) {
      flags.push(flag);
      if (outcome === 'pass') outcome = 'review';
    }
  }
  return { outcome, flags };
}

export interface GuideInputActions {
  /** Injection flagged: the turn runs with read tools only. */
  readonly readOnlyTools: boolean;
  /** Self-harm or violence flagged: the Help safety card is shown beside the answer. */
  readonly safetyCard: boolean;
}

export function guideInputActions(result: ComplianceResult): GuideInputActions {
  const flagged = new Set(result.flags.map((flag) => flag.category));
  return {
    readOnlyTools: flagged.has('prompt_injection'),
    safetyCard: flagged.has('self_harm') || flagged.has('violence'),
  };
}
