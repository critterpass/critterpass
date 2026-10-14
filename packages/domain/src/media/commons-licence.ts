/**
 * Wikimedia Commons licences we reuse (https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia):
 * public domain, CC0, CC BY and CC BY-SA only. NC, ND, GFDL-only and unknown licences are refused.
 * BY and BY-SA need the author, licence and a link, which the credit carries and the app shows.
 */

export interface CommonsExtValue {
  readonly value: string;
}

export type CommonsExtMetadata = Partial<
  Record<
    'Artist' | 'LicenseShortName' | 'LicenseUrl' | 'AttributionRequired' | 'ObjectName',
    CommonsExtValue
  >
>;

export interface CommonsPage {
  pageid: number;
  title: string;
  missing?: boolean;
  imageinfo?: {
    url: string;
    thumburl?: string;
    width: number;
    height: number;
    descriptionurl: string;
    mime: string;
    extmetadata?: CommonsExtMetadata;
  }[];
}

/** Licence code for a Commons short name, or null for a licence we do not reuse (NC, ND, GFDL). */
export function commonsLicence(shortName: string): string | null {
  const name = shortName.trim().toLowerCase();
  if (name === 'public domain' || name === 'pd') return 'public-domain';
  if (name === 'cc0' || name === 'cc0 1.0') return 'cc0';
  const match = /^cc by(-sa)? (\d\.\d)$/u.exec(name);
  if (match === null) return null;
  return `cc-by${match[1] ?? ''}-${match[2] ?? ''}`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/gu, '')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#0?39;/gu, "'")
    .replace(/&nbsp;/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export interface CommonsCredit {
  readonly licence: string;
  readonly licenceUrl: string;
  readonly author: string;
  readonly attributionRequired: boolean;
  /** "Name · CC BY-SA 4.0 · Wikimedia Commons" */
  readonly credit: string;
  readonly title: string;
}

/** The licence and credit of a file page, or null when its licence or author does not qualify. */
export function commonsCredit(page: CommonsPage): CommonsCredit | null {
  const meta = page.imageinfo?.[0]?.extmetadata;
  if (meta === undefined) return null;
  const shortName = meta.LicenseShortName?.value ?? '';
  const licence = commonsLicence(shortName);
  const author = stripHtml(meta.Artist?.value ?? '').slice(0, 200);
  if (licence === null || author === '') return null;
  const free = licence === 'public-domain' || licence === 'cc0';
  const licenceUrl =
    meta.LicenseUrl?.value ?? 'https://commons.wikimedia.org/wiki/Commons:Licensing';
  return {
    licence,
    licenceUrl: licenceUrl.replace(/^http:/u, 'https:'),
    author,
    attributionRequired: !free,
    credit: `${author} · ${free ? 'Public domain' : shortName} · Wikimedia Commons`.slice(0, 300),
    title: stripHtml(meta.ObjectName?.value ?? page.title.replace(/^File:/u, '')).slice(0, 300),
  };
}
