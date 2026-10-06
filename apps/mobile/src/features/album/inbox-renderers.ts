/**
 * How the postcard's inbox items read: a crewmate sent you a postcard, a crewmate wants to mail
 * you a printed one and needs your address (a card until you save one), and how your own printed
 * mailing went. The rows carry ids and a status; the words are here.
 */
import { POSTCARD_INBOX_KIND } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { registerInboxRenderer, type InboxItem, type InboxRenderContext } from '@/features/home';

function receivedLine(item: InboxItem, ctx: InboxRenderContext): string {
  const name = item.actorName;
  return name === ''
    ? ctx.i18n._(msg({ id: 'album.inbox.received.plain', message: 'A postcard for you' }))
    : ctx.i18n._(msg({ id: 'album.inbox.received', message: `${name} sent you a postcard` }));
}

function addressLine(item: InboxItem, ctx: InboxRenderContext): string {
  const name = item.actorName;
  return name === ''
    ? ctx.i18n._(
        msg({ id: 'album.inbox.address.plain', message: 'Your crew wants to mail you a postcard' }),
      )
    : ctx.i18n._(
        msg({ id: 'album.inbox.address', message: `${name} wants to mail you a postcard` }),
      );
}

function mailingLine(item: InboxItem, ctx: InboxRenderContext): string {
  return item.data['status'] === 'failed'
    ? ctx.i18n._(
        msg({
          id: 'album.inbox.mailing.failed',
          message: "Your printed postcards couldn't be made. This trip's mailing is free again.",
        }),
      )
    : ctx.i18n._(
        msg({
          id: 'album.inbox.mailing.shipped',
          message: 'Your printed postcards are in the post',
        }),
      );
}

let registered = false;

export function registerAlbumInboxRenderers(): void {
  if (registered) return;
  registered = true;

  registerInboxRenderer(POSTCARD_INBOX_KIND.received, {
    icon: 'ticket',
    tone: 'yellow',
    card: (item, ctx) => ({
      title: receivedLine(item, ctx),
      body: ctx.i18n._(
        msg({ id: 'album.inbox.received.body', message: 'Open it and read the back.' }),
      ),
    }),
    line: receivedLine,
    actionLabel: (_action, _item, ctx) =>
      ctx.i18n._(msg({ id: 'album.inbox.received.open', message: 'Open it' })),
  });

  registerInboxRenderer(POSTCARD_INBOX_KIND.addressRequested, {
    icon: 'ticket',
    tone: 'pink',
    card: (item, ctx) => ({
      title: addressLine(item, ctx),
      body: ctx.i18n._(
        msg({
          id: 'album.inbox.address.body',
          message: 'Add an address. Only the printer sees it, never your crew.',
        }),
      ),
    }),
    line: addressLine,
    actionLabel: (_action, _item, ctx) =>
      ctx.i18n._(msg({ id: 'album.inbox.address.open', message: 'Add an address' })),
  });

  registerInboxRenderer(POSTCARD_INBOX_KIND.mailingUpdated, { line: mailingLine });
}
