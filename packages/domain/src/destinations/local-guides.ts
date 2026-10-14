/**
 * Local tour guides of a destination (`local_guides`, docs/data-model.md §3.13), as
 * `GET /v1/destinations/{id}/guides` answers them: only what a guide publishes to sell their
 * guiding, a summary of their public reputation in the reader's language, a third-party
 * platform's rating with its page, and whether an official licence is shown. Never a phone number,
 * an email or anything private; a traveller reaches a guide through `profile_url`.
 */
export const LOCAL_GUIDE_KINDS = ['individual', 'company', 'community'] as const;
export type LocalGuideKind = (typeof LOCAL_GUIDE_KINDS)[number];

export const GUIDE_LICENCE_STATES = ['yes', 'no', 'unknown'] as const;
export type GuideLicenceState = (typeof GUIDE_LICENCE_STATES)[number];

export interface LocalGuideRating {
  /** The platform's displayed average (0–5). */
  readonly value: number;
  readonly count: number;
  /** "Tours by Locals", "Tripadvisor", …, never the guide's own site. */
  readonly platform: string;
  readonly url: string;
}

export interface LocalGuideWire {
  readonly id: string;
  /** As the guide publishes it. */
  readonly name: string;
  readonly kind: LocalGuideKind;
  /** ISO 639-1 codes. */
  readonly languages: readonly string[];
  readonly specialties: readonly string[];
  readonly areas: readonly string[];
  /** The published price and the page it is on, or null. */
  readonly price: { readonly text: string; readonly source_url: string | null } | null;
  /** The guide's own site or their profile on a guiding platform. */
  readonly profile_url: string;
  readonly review_summary: string;
  /** The language `review_summary` is in (the reader's, else English). */
  readonly review_summary_locale: string;
  readonly rating: LocalGuideRating | null;
  readonly licensed: GuideLicenceState;
}

export interface DestinationGuidesWire {
  readonly destination_id: string;
  readonly guides: readonly LocalGuideWire[];
}
