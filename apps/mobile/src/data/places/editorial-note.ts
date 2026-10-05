/**
 * A place's note (`pois.editorial`, synced as JSON text) as this reader sees it: each line in the
 * app's language where the note has it, else English (`@cp/domain` `localizedEditorial`, the one
 * place that rule lives). A note that does not read as one is left as it is.
 */
import { editorialOverlaySchema, localizedEditorial } from '@cp/domain';

/** The note's fields in the reader's language; null without a note. */
export function editorialFor(
  raw: string | null | undefined,
  locale: string,
): Record<string, unknown> | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const parsed = editorialOverlaySchema.safeParse(value);
  return parsed.success
    ? localizedEditorial(parsed.data, locale)
    : (value as Record<string, unknown>);
}

/** The same, back as JSON text, for rows that carry the note as text. */
export function editorialTextFor(raw: string | null, locale: string): string | null {
  const note = editorialFor(raw, locale);
  return note === null ? raw : JSON.stringify(note);
}
