/* eslint-disable lingui/no-unlocalized-strings -- collection names and ids, not UI copy. */
/**
 * The legal set joined with its MDX bodies: each registered version of each document, and which
 * one is current. Drafts pending counsel review still render (with their banner); the registry in
 * @cp/content is the source of truth for versions and dates.
 */
import {
  LEGAL_DOC_KEYS,
  LEGAL_DOCS,
  latestVersion,
  type LegalDocKey,
  type LegalVersion,
} from '@cp/content/legal';
import { getEntry, type CollectionEntry } from 'astro:content';

export interface LegalPageData {
  readonly doc: LegalDocKey;
  readonly title: string;
  readonly version: LegalVersion;
  readonly current: LegalVersion;
  readonly versions: readonly LegalVersion[];
  readonly entry: CollectionEntry<'legal'>;
}

export async function legalPage(doc: LegalDocKey, version: string): Promise<LegalPageData> {
  const found = LEGAL_DOCS[doc].versions.find((entry) => entry.version === version);
  // The collection's generated types are not visible to lint; the entry is checked below.
  const loaded: unknown = await getEntry('legal', `${doc}/${version}`);
  if (found === undefined || loaded === undefined || loaded === null) {
    throw new Error(`legal: ${doc} ${version} is registered without a document, or the reverse`);
  }
  return {
    doc,
    title: LEGAL_DOCS[doc].title,
    version: found,
    current: latestVersion(doc),
    versions: LEGAL_DOCS[doc].versions,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- the collection's generated entry type (see above).
    entry: loaded as CollectionEntry<'legal'>,
  };
}

export function everyVersion(): readonly { readonly doc: LegalDocKey; readonly version: string }[] {
  return LEGAL_DOC_KEYS.flatMap((doc) =>
    LEGAL_DOCS[doc].versions.map((entry) => ({ doc, version: entry.version })),
  );
}

/** "Sept 2026" style, from a calendar day. */
export function monthYear(day: string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

export function longDate(day: string): string {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}
