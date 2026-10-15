/** The words of the earlier-drafts list: what each draft was, when it was made, what restoring it does. */
import { t } from '@lingui/core/macro';
import type { DraftOrigin } from '../data/history';
import type { HistoryEntry } from '../data/use-draft-version';
import { clockOption } from '@/lib/i18n/formats';

/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
export function madeAt(locale: string, iso: string): string {
  const at = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    ...clockOption(),
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/* eslint-enable lingui/no-unlocalized-strings */

export function originLabel(origin: DraftOrigin, guideName: string): string {
  switch (origin.kind) {
    case 'first':
      return t({ id: 'planDraft.history.first', message: `${guideName}’s first draft` });
    case 'drafted':
      return t({ id: 'planDraft.history.drafted', message: `${guideName} drafted it again` });
    case 'redraft': {
      const n = origin.dayNo;
      return n === null
        ? t({ id: 'planDraft.history.redraftAny', message: 'A day redrafted' })
        : t({ id: 'planDraft.history.redraft', message: `Day ${n} redrafted` });
    }
    case 'put_back': {
      const n = origin.dayNo;
      return n === null
        ? t({ id: 'planDraft.history.putBackAny', message: 'A redraft you put back' })
        : t({ id: 'planDraft.history.putBack', message: `Day ${n} redrafted, put back` });
    }
    case 'changed':
      return t({ id: 'planDraft.history.changed', message: 'Changed by you' });
    case 'own':
      return t({ id: 'planDraft.history.own', message: 'The plan you started' });
  }
}

/** Under a redraft she put back: what restoring it does, and that it costs her nothing. */
export function putBackLine(dayNo: number | null): string {
  const n = dayNo;
  return n === null
    ? t({
        id: 'planDraft.history.putBackRestoreAny',
        message: 'Restoring brings back the draft as it was redrafted. It doesn’t use a redraft.',
      })
    : t({
        id: 'planDraft.history.putBackRestore',
        message: `Restoring brings back the draft with day ${n} as redrafted. It doesn’t use a redraft.`,
      });
}

export interface VersionHistorySheetProps {
  readonly entries: readonly HistoryEntry[];
  readonly guideName: string;
  readonly locale: string;
  readonly onRestore: (entry: HistoryEntry) => void;
  readonly onClose: () => void;
}
