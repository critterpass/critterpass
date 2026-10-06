/** The recap postcard card's words, kept with the album's catalog. */
import { t } from '@lingui/core/macro';

export function postcardCardCopy() {
  return {
    eyebrow: t({ id: 'album.postcard.eyebrow', message: 'Last card' }),
    title: t({ id: 'album.postcard.title', message: 'Send it home' }),
    send: t({ id: 'album.postcard.open', message: 'Send it home' }),
    album: t({ id: 'album.postcard.album', message: 'See all the photos' }),
  };
}
