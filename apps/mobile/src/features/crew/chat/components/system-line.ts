/** Copy for `system` rows: joins, departures and renames, by the member's first name. */
import { t } from '@lingui/core/macro';

import { firstName } from '../data/use-typing';

export function systemLine(
  refKind: string | null,
  who: string | null | undefined,
  body: string,
): string {
  const name = firstName(who) ?? t({ id: 'chat.system.someone', message: 'Someone' });
  switch (refKind) {
    case 'member_joined':
      return t({ id: 'chat.system.joined', message: `${name} joined the crew` });
    case 'member_left':
      return t({ id: 'chat.system.left', message: `${name} left the crew` });
    case 'crew_renamed':
      return t({ id: 'chat.system.renamed', message: `${name} renamed the crew to ${body}` });
    case null:
    default:
      return body;
  }
}
