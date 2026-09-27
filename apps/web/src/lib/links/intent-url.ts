/* eslint-disable lingui/no-unlocalized-strings -- Android intent URL syntax, not UI copy. */
/**
 * Android Chrome intent URLs. `openAppIntent` opens the app for an https link when it is installed
 * (the package is named, so it works even before App Link verification) and otherwise falls back
 * to the Play listing with the install referrer. `openInChromeIntent` lifts a page out of an in-app
 * browser into Chrome.
 */

function intentFor(host: string, pathAndQuery: string, extras: readonly string[]): string {
  const path = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  return `intent://${host}${path}#Intent;scheme=https;${extras.join(';')};end`;
}

export function openAppIntent(input: {
  readonly host: string;
  readonly path: string;
  readonly packageName: string;
  readonly fallbackUrl: string;
}): string {
  return intentFor(input.host, input.path, [
    `package=${input.packageName}`,
    `S.browser_fallback_url=${encodeURIComponent(input.fallbackUrl)}`,
  ]);
}

export function openInChromeIntent(input: {
  readonly host: string;
  readonly path: string;
}): string {
  return intentFor(input.host, input.path, ['package=com.android.chrome']);
}
