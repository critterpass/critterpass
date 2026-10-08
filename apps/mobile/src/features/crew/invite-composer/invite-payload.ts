/**
 * The `create_invite` payload for what the composer holds: the open link for the crew (or one of
 * its trips), or a named seat with only what the inviter typed or picked about the friend, a home
 * hint read from the phone number, and the tags they chose.
 */
import { airportDataset } from '@cp/content/airports';
import { DIAL_CODES } from '@cp/content/onboarding';
import type { CreateInvitePayload } from '@cp/domain';

import { shareVia, type ComposerChannel } from './compose';
import type { ContactDraft } from './ContactFields';
import { homeHintFor, toE164 } from './home-hint';

export function invitePayload(
  draft: {
    readonly crewId: string;
    readonly tripId: string | null;
    /** The friend being invited by name; null for the open link. */
    readonly contact: ContactDraft | null;
  },
  channel: ComposerChannel,
  onFull?: 'waitlist',
): CreateInvitePayload {
  const via = shareVia(channel);
  const base = {
    crew_id: draft.crewId,
    ...(draft.tripId === null ? {} : { trip_id: draft.tripId }),
    ...(via === undefined ? {} : { share_via: via }),
    ...(onFull === undefined ? {} : { on_full: onFull }),
  };
  const { contact } = draft;
  if (contact === null) return { ...base, channel: 'link' };
  const phone = toE164(contact.phone);
  const homeHint =
    phone === null ? null : homeHintFor(phone, DIAL_CODES, airportDataset().airports);
  return {
    ...base,
    channel: 'contact',
    contact: {
      name: contact.name.trim(),
      provenance: contact.picked ? 'contacts' : 'typed',
      ...(phone === null ? {} : { phone_e164: phone }),
      ...(homeHint === null ? {} : { home_hint: homeHint }),
    },
    ...(contact.note.trim() === '' ? {} : { note: contact.note.trim() }),
    ...(contact.tags.length === 0 ? {} : { tags: [...contact.tags] }),
  };
}
