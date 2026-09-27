/**
 * The evening roundup's copy (5b-1): "Tokek's evening roundup", "3 things for tomorrow", then the
 * numbered lines. Rendered in the recipient's locale from the `notifications/roundup` catalog.
 */
import type { CopyRenderer } from '../../push/render';

const TITLE = /*i18n*/ {
  id: 'notifications.roundup.title',
  message: "{guide}'s evening roundup",
};
const TITLE_WITHOUT_GUIDE = /*i18n*/ {
  id: 'notifications.roundup.titleWithoutGuide',
  message: 'Your evening roundup',
};
const SUBTITLE = /*i18n*/ {
  id: 'notifications.roundup.subtitle',
  message: '{count, plural, one {# thing for tomorrow} other {# things for tomorrow}}',
};

/** Numbered lines, one per item, as the notification body. */
export function renderLines(lines: readonly string[]): string {
  return lines.map((line, index) => `${index + 1}. ${line}`).join('\n');
}

export interface RoundupCopy {
  readonly title: string;
  readonly subtitle: string;
  readonly body: string;
  readonly templateId: string;
}

export async function composeRoundup(
  renderer: CopyRenderer,
  locale: string,
  input: { readonly guideName: string | undefined; readonly lines: readonly string[] },
): Promise<RoundupCopy> {
  const title =
    input.guideName === undefined
      ? await renderer.render(locale, TITLE_WITHOUT_GUIDE)
      : await renderer.render(locale, TITLE, { guide: input.guideName });
  const subtitle = await renderer.render(locale, SUBTITLE, { count: input.lines.length });
  return { title, subtitle, body: renderLines(input.lines), templateId: SUBTITLE.id };
}
