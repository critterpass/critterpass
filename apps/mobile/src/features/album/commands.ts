/**
 * Client specs for the album's and postcards' commands. Registering a photo, picking, tagging,
 * deleting and saving a postcard may wait in the offline queue (the server replays them by id);
 * "download all", sending to the crew, mailing a printed card and saving an address go online
 * only, so the screen never claims they happened while they wait unsent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  CreatePostcardPayload,
  DeletePhotoPayload,
  EditPostcardPayload,
  MailPostcardPayload,
  RegisterPhotoPayload,
  ReportContentPayload,
  RequestAlbumExportPayload,
  SaveMailingAddressPayload,
  SendPostcardPayload,
  SetAlbumPickPayload,
  TagSelfInPhotoPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const registerPhotoCommand = defineClientCommand<RegisterPhotoPayload>({
  name: 'register_photo',
  offline: true,
  summarize: () => msg({ id: 'album.queued.photo', message: 'A photo for the crew album' }),
});

export const deletePhotoCommand = defineClientCommand<DeletePhotoPayload>({
  name: 'delete_photo',
  offline: true,
  summarize: () => msg({ id: 'album.queued.delete', message: 'Taking a photo out of the album' }),
});

export const setAlbumPickCommand = defineClientCommand<SetAlbumPickPayload>({
  name: 'set_album_pick',
  offline: true,
  summarize: ({ picked }) =>
    picked
      ? msg({ id: 'album.queued.pick', message: 'A photo into the picks' })
      : msg({ id: 'album.queued.unpick', message: 'A photo out of the picks' }),
});

export const tagSelfInPhotoCommand = defineClientCommand<TagSelfInPhotoPayload>({
  name: 'tag_self_in_photo',
  offline: true,
  summarize: ({ on }) =>
    on
      ? msg({ id: 'album.queued.tag', message: "You're in a photo" })
      : msg({ id: 'album.queued.untag', message: "You're not in a photo" }),
});

export const requestAlbumExportCommand = defineClientCommand<RequestAlbumExportPayload>({
  name: 'request_album_export',
  offline: false,
});

export const createPostcardCommand = defineClientCommand<CreatePostcardPayload>({
  name: 'create_postcard',
  offline: true,
  summarize: () => msg({ id: 'album.queued.postcard', message: 'Your postcard' }),
});

export const editPostcardCommand = defineClientCommand<EditPostcardPayload>({
  name: 'edit_postcard',
  offline: true,
  summarize: () => msg({ id: 'album.queued.postcardEdit', message: 'Changes to your postcard' }),
});

export const sendPostcardCommand = defineClientCommand<SendPostcardPayload>({
  name: 'send_postcard',
  offline: false,
});

export const mailPostcardCommand = defineClientCommand<MailPostcardPayload>({
  name: 'mail_postcard',
  offline: false,
});

export const saveMailingAddressCommand = defineClientCommand<SaveMailingAddressPayload>({
  name: 'save_mailing_address',
  offline: false,
});

export const reportPhotoCommand = defineClientCommand<ReportContentPayload>({
  name: 'report_content',
  offline: true,
  summarize: () => msg({ id: 'album.queued.report', message: 'A photo reported' }),
});
