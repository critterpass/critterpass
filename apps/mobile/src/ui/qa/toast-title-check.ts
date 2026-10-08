import { isTruncated } from './text-layout-check';
import { reportUiQa, UI_QA_ENABLED } from './ui-qa';

/**
 * Reports a toast title that still loses words on the lines it is given: copy to shorten, or to
 * split into a title and a subtitle. Handed to the island toast by the app root (motion sits below
 * the component library). Android reports the lines as drawn; iOS hands the last line back whole,
 * so a cut shows there only on a device sheet.
 */
export function reportTruncatedToastTitle(
  title: string,
  lines: readonly { readonly text: string }[],
): void {
  if (!UI_QA_ENABLED || !isTruncated(lines, title)) return;
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a report code and detail, never shown to a user
  reportUiQa('TEXT_TRUNCATED', title.slice(0, 40), 'toast title');
}
