/**
 * Where a printed postcard can be mailed. The print partner ships worldwide except to countries
 * under trade sanctions and a few it cannot deliver to; recipients there get the digital postcard
 * only, and the app says so. The api sorts recipients by it and the worker checks it again before
 * ordering.
 */
export const PRINT_UNSUPPORTED_COUNTRIES: ReadonlySet<string> = new Set([
  'AF', // Afghanistan
  'BY', // Belarus
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'RU', // Russia
  'SS', // South Sudan
  'SY', // Syria
  'YE', // Yemen
]);

/** True when a printed postcard can be mailed to an address in `country` (ISO 3166-1 alpha-2). */
export function printShipsTo(country: string): boolean {
  return /^[A-Z]{2}$/u.test(country) && !PRINT_UNSUPPORTED_COUNTRIES.has(country);
}
