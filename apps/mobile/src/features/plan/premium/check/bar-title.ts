/**
 * The current UI's stacked capitals heading ("CHECKING\nTHE PLAN", "2 TO FIX,\n1 TO KNOW") as the
 * premium bar's one line in sentence case ("Checking the plan", "2 to fix, 1 to know"). A heading
 * already written in mixed case keeps its words and only loses its line breaks.
 */
export function barTitle(heading: string, locale: string): string {
  const line = heading.replace(/\s*\n\s*/gu, ' ').trim();
  if (line !== line.toLocaleUpperCase(locale)) return line;
  const lower = line.toLocaleLowerCase(locale);
  return lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1);
}
