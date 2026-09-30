/**
 * What each shelf sticker is called and how it was earned, in the traveller's language.
 */
import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { ShelfItem } from './sticker-model';

export function stickerName(i18n: I18n, item: ShelfItem): string {
  switch (item.kind) {
    case 'settled':
      return i18n._(msg({ id: 'stickers.name.settled', message: 'Settled Tokek' }));
    case 'crew_level':
      return i18n._(
        msg({ id: 'stickers.name.crewLevel', message: `Crew level ${String(item.level ?? '')}` }),
      );
    case 'special':
      return i18n._(msg({ id: 'stickers.name.special', message: 'Special sticker' }));
  }
}

export function stickerHow(i18n: I18n, item: ShelfItem): string {
  const place = item.place;
  const crew = item.crewName;
  switch (item.kind) {
    case 'settled':
      return place === ''
        ? i18n._(
            msg({
              id: 'stickers.how.settledNoPlace',
              message: 'Everyone settled up, to the last payment.',
            }),
          )
        : i18n._(
            msg({
              id: 'stickers.how.settled',
              message: `Everyone settled up on ${place}, to the last payment.`,
            }),
          );
    case 'crew_level':
      return i18n._(
        msg({
          id: 'stickers.how.crewLevel',
          message: `${crew} reached crew level ${String(item.level ?? '')} with quests, finds and visits.`,
        }),
      );
    case 'special':
      return i18n._(
        msg({
          id: 'stickers.how.special',
          message: 'A one-off, for something only your crew did.',
        }),
      );
  }
}
