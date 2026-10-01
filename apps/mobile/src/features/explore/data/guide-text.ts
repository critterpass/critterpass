/**
 * Text a guide or an editor wrote that the app shows as it came (a place's "why go", a month's
 * highlight, a guide tip, the crew's Q&A line). Every such string passes through here, so the
 * day it carries one version per language this is the only place that picks one.
 */
export function guideWritten(text: string, locale: string): string;
export function guideWritten(text: string | null | undefined, locale: string): string | null;
export function guideWritten(text: string | null | undefined, locale: string): string | null {
  void locale;
  return text ?? null;
}
