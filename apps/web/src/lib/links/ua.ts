/**
 * Which device and browser opened a link page. Universal Links and App Links often do not fire
 * inside social apps' in-app browsers, so those get an "Open in your browser" overlay instead of a
 * dead "Open in app" button.
 */

export type LinkPlatform = 'ios' | 'android' | 'desktop';

export const IN_APP_BROWSERS = [
  'instagram',
  'tiktok',
  'facebook',
  'messenger',
  'line',
  'whatsapp',
  'x',
] as const;
export type InAppBrowser = (typeof IN_APP_BROWSERS)[number];

export interface UserAgentInfo {
  readonly platform: LinkPlatform;
  readonly inAppBrowser: InAppBrowser | null;
}

/** Ordered: Messenger's UA also carries Facebook's tokens, so it is checked first. */
const IN_APP_PATTERNS: readonly (readonly [InAppBrowser, RegExp])[] = [
  ['instagram', /\bInstagram\b/i],
  ['tiktok', /\b(?:musical_ly|TikTok|BytedanceWebview|trill)\b/i],
  ['messenger', /\b(?:Messenger|MessengerForiOS|Orca-Android)\b/i],
  ['facebook', /\b(?:FBAN|FBAV|FB_IAB|FB4A|FBIOS)\b/i],
  ['line', /\bLine\/\d/],
  ['whatsapp', /\bWhatsApp\/\d/i],
  ['x', /\b(?:Twitter for iPhone|TwitterAndroid|Twitter for Android)\b/i],
];

export function detectPlatform(userAgent: string): LinkPlatform {
  if (/\b(?:iPhone|iPad|iPod)\b/.test(userAgent)) return 'ios';
  if (/\bAndroid\b/.test(userAgent)) return 'android';
  return 'desktop';
}

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  for (const [name, pattern] of IN_APP_PATTERNS) {
    if (pattern.test(userAgent)) return name;
  }
  return null;
}

export function readUserAgent(userAgent: string | null | undefined): UserAgentInfo {
  const ua = userAgent ?? '';
  return { platform: detectPlatform(ua), inAppBrowser: detectInAppBrowser(ua) };
}
