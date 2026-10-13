/** The credit line's inset from a photo's sides, and the credit's own padding. */
const CREDIT_INSET = 12 + 6;
/** A caption letter's average width, for telling whether a credit fits its line. */
const CREDIT_CHAR_PT = 5.8;

/**
 * The credit a photo this wide shows on its one line: the whole line when it fits, else the author
 * alone (the credit's first part; the whole credit is on the place page). Unmeasured, the whole.
 */
export function creditFor(credit: string, widthPt: number | null): string {
  if (widthPt === null) return credit;
  if (credit.length * CREDIT_CHAR_PT <= widthPt - 2 * CREDIT_INSET) return credit;
  return credit.split(' · ')[0] ?? credit;
}
