/**
 * The legal set: every document, every published version, newest first. The site renders
 * `<doc>/<version>.mdx` for each entry; the app shows the version it records in `consents`, read
 * from `legalVersions()` (the `legal.versions` client config value). A version is immutable once
 * published: changes ship as a new version with its own summary of changes.
 */
import { z } from 'zod';

export const LEGAL_DOC_KEYS = [
  'privacy',
  'terms',
  'subscription-terms',
  'location',
  'ai',
  'affiliates',
  'community-guidelines',
  'referral-terms',
  'support',
] as const;
export type LegalDocKey = (typeof LEGAL_DOC_KEYS)[number];

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;

export const legalVersionSchema = z
  .object({
    version: z.string().regex(SEMVER, 'version: semver, e.g. 1.2.0'),
    /** Calendar day (UTC) the version takes effect. */
    effective_at: z.iso.date(),
    summary_of_changes: z.string().min(3).max(280),
    /** A material change: the app asks for fresh acceptance and the site shows a banner. */
    material: z.boolean(),
    /** Draft text carries a review banner until counsel signs the version off. */
    counsel_review: z.enum(['pending', 'approved']),
  })
  .strict();
export type LegalVersion = z.infer<typeof legalVersionSchema>;

export const legalDocSchema = z
  .object({
    title: z.string().min(3).max(60),
    summary: z.string().min(10).max(200),
    versions: z.array(legalVersionSchema).min(1),
  })
  .strict();
export type LegalDoc = z.infer<typeof legalDocSchema>;

/** Frontmatter of each `<doc>/<version>.mdx`. */
export const legalFrontmatterSchema = z
  .object({
    doc: z.enum(LEGAL_DOC_KEYS),
    version: z.string().regex(SEMVER),
    /** The short version, as up to three plain lines. */
    tldr: z.array(z.string().min(3).max(160)).max(3).default([]),
  })
  .strict();
export type LegalFrontmatter = z.infer<typeof legalFrontmatterSchema>;

const FIRST_DRAFT: LegalVersion = {
  version: '1.0.0',
  effective_at: '2026-09-28',
  summary_of_changes: 'First version.',
  material: false,
  counsel_review: 'pending',
};

export const LEGAL_DOCS: Readonly<Record<LegalDocKey, LegalDoc>> = {
  privacy: {
    title: 'Privacy',
    summary: 'What we collect, why, who sees it, where it lives and how to delete it.',
    versions: [FIRST_DRAFT],
  },
  terms: {
    title: 'Terms',
    summary: 'The agreement between you and CritterPass for using the app and the site.',
    versions: [FIRST_DRAFT],
  },
  'subscription-terms': {
    title: 'Subscriptions',
    summary: 'Pass+, Trip Boost and Crew yearly: prices, auto-renewal, cancelling and refunds.',
    versions: [FIRST_DRAFT],
  },
  location: {
    title: 'Location',
    summary: 'When the app uses your location, what it keeps, and how to switch it off.',
    versions: [FIRST_DRAFT],
  },
  ai: {
    title: 'AI guides',
    summary: 'Your guide is an AI: what it does with your words and where it can be wrong.',
    versions: [FIRST_DRAFT],
  },
  affiliates: {
    title: 'Affiliate links',
    summary: 'How bookings through partners work and how we are paid for them.',
    versions: [FIRST_DRAFT],
  },
  'community-guidelines': {
    title: 'Community guidelines',
    summary: 'What you can post, share and say in crews and public plans.',
    versions: [FIRST_DRAFT],
  },
  'referral-terms': {
    title: 'Referral terms',
    summary: 'How stamps for bringing friends work, and what they are worth.',
    versions: [FIRST_DRAFT],
  },
  support: {
    title: 'Help and support',
    summary: 'How to reach a person, report a problem or delete your account.',
    versions: [FIRST_DRAFT],
  },
};

export function latestVersion(doc: LegalDocKey): LegalVersion {
  const latest = LEGAL_DOCS[doc].versions[0];
  if (latest === undefined) throw new Error(`legal: ${doc} has no versions`);
  return latest;
}

/** `{ privacy: '1.0.0', … }`: the current version of every document. */
export function legalVersions(): Readonly<Record<LegalDocKey, string>> {
  return Object.fromEntries(
    LEGAL_DOC_KEYS.map((doc) => [doc, latestVersion(doc).version]),
  ) as Record<LegalDocKey, string>;
}

/** The public client config entry the app reads to show and record accepted versions. */
export const LEGAL_VERSIONS_CONFIG_KEY = 'legal.versions';

/** Attribution the IP-to-city data licence (CC BY 4.0) requires wherever the data is credited. */
export const DBIP_ATTRIBUTION = {
  text: 'IP geolocation by DB-IP',
  href: 'https://db-ip.com',
  licence: 'CC BY 4.0',
  licenceHref: 'https://creativecommons.org/licenses/by/4.0/',
} as const;
