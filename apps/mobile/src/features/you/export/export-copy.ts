/** The Download my data row's line, from its state and any problem. */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import type { ExportState } from './export-state';
import type { ExportProblem } from './use-data-export';

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

export function exportLine(state: ExportState, problem: ExportProblem, locale: string): string {
  if (problem === 'offline') {
    return t({ id: 'you.export.offline', message: 'Needs a connection. Try again in a moment.' });
  }
  if (problem === 'too_soon') {
    return t({ id: 'you.export.tooSoon', message: 'One export a day. Try again tomorrow.' });
  }
  if (problem === 'refused') {
    return t({
      id: 'you.export.refused',
      message: 'Couldn’t ask for it just now. Try again later.',
    });
  }
  if (problem === 'link_failed') {
    return t({ id: 'you.export.linkFailed', message: 'Couldn’t open it. Try again.' });
  }
  switch (state.kind) {
    case 'none':
      return t({ id: 'you.export.line', message: 'Plans, photos and chat as a zip' });
    case 'building':
      return t({
        id: 'you.export.building',
        message: `Getting it ready… ${state.progress}%. We’ll tell you when it’s done.`,
      });
    case 'ready': {
      const until = format.date(locale, new Date(state.expiresAt), DAY_MONTH);
      return t({ id: 'you.export.ready', message: `Ready to download until ${until}` });
    }
    case 'expired': {
      if (state.askAgainAt === null) {
        return t({ id: 'you.export.expired', message: 'That one expired. Ask for a fresh one.' });
      }
      const day = format.date(locale, new Date(state.askAgainAt), DAY_MONTH);
      return t({
        id: 'you.export.expiredWait',
        message: `That one expired. You can ask again on ${day}.`,
      });
    }
    case 'failed':
      return t({ id: 'you.export.failed', message: 'That didn’t work. Try again.' });
  }
}
