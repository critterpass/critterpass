/**
 * What safety wording may never do, checked on every model reply before anyone sees it: state a
 * number that is not in the curated facts, name a place the facts do not name, give medical advice
 * or say that emergency services were contacted. Shared by the Help checklist and the SOS summary.
 */

/** Digit runs as written (phone numbers keep their inner spaces and dashes). */
export function numbersIn(text: string): string[] {
  return (text.match(/\+?\d[\d\s-]*\d|\d/gu) ?? []).map((token) => token.replace(/[\s-]/gu, ''));
}

/** Numbers in `text` that none of `facts` contains (compared without spaces and dashes). */
export function inventedNumbers(text: string, facts: readonly string[]): string[] {
  const allowed = facts.map((fact) => fact.replace(/[\s-]/gu, ''));
  return numbersIn(text).filter((token) => {
    const bare = token.replace(/^\+/u, '');
    return !allowed.some((fact) => fact.includes(bare));
  });
}

/** Medical instructions: drugs, doses, treatments. The crew and a clinic decide those. */
const MEDICAL_ADVICE: readonly RegExp[] = [
  /\b(ibuprofen|paracetamol|acetaminophen|aspirin|antibiotic|antihistamine|painkiller)s?\b/iu,
  /\b\d+\s?(mg|ml)\b/iu,
  /\b(tourniquet|splint|cpr|stitches|dose|dosage)\b/iu,
  /\b(apply|drink|elevate|bandage) (it|the|some|your|a)\b/iu,
  /\btake (some |a |your )?(pill|medicine|medication|tablet)s?\b/iu,
  /(uống thuốc|liều dùng|bôi thuốc)/iu,
];

/** Claims that anyone called or dispatched emergency services: CritterPass only tells the crew. */
const DISPATCH_CLAIMS: readonly RegExp[] = [
  /\b(we|i|critterpass|tokek|your guide)\b[^.]{0,20}\b(called|contacted|alerted|notified|dispatched)\b[^.]{0,20}\b(police|ambulance|emergency|hospital)/iu,
  /\b(ambulance|police|help)\b[^.]{0,12}\b(is|are) (on (its|their) way|coming|dispatched)\b/iu,
  /\bemergency services (have|has) been\b/iu,
  /\bđã (gọi|báo) (cấp cứu|công an|cảnh sát)\b/iu,
];

/** Facility words: a reply naming one needs the facts to name it too. */
const FACILITY_WORDS =
  /\b(hospital|clinic|pharmacy|embassy|consulate|bệnh viện|phòng khám|nhà thuốc|đại sứ quán)\b/iu;

export type GuardVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface GuardFacts {
  /** Every fact the text may state (numbers, names, minutes), as strings. */
  readonly facts: readonly string[];
  /** Whether the facts name a facility the text may refer to. */
  readonly facilityNamed: boolean;
}

export function guardSafetyText(text: string, input: GuardFacts): GuardVerdict {
  const loose = inventedNumbers(text, input.facts);
  if (loose.length > 0) return { ok: false, reason: `invented_number:${loose.join(',')}` };
  if (MEDICAL_ADVICE.some((pattern) => pattern.test(text))) {
    return { ok: false, reason: 'medical_advice' };
  }
  if (DISPATCH_CLAIMS.some((pattern) => pattern.test(text))) {
    return { ok: false, reason: 'dispatch_claim' };
  }
  if (!input.facilityNamed && FACILITY_WORDS.test(text)) {
    return { ok: false, reason: 'invented_facility' };
  }
  return { ok: true };
}
