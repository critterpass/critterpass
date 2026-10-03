/**
 * What face a member wears, from their synced avatar row: their photo (theirs to see while it is
 * checked; everyone else's only once approved), a guide sticker, or their initial. Pure, so the
 * moderation and ownership rules are tested without a database.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { guideOfForm, type OnboardingGuide } from '@cp/domain';

export type AvatarRing = 'rare' | 'epic' | 'legendary';

export type MemberFace =
  | { readonly kind: 'initials' }
  | { readonly kind: 'guide'; readonly guide: OnboardingGuide; readonly ring: AvatarRing | null }
  /** A critter form from the collection; drawn as its sticker once that art is offered. */
  | { readonly kind: 'form'; readonly formId: string; readonly ring: AvatarRing | null }
  | { readonly kind: 'photo'; readonly mediaKey: string };

export interface AvatarRow {
  readonly user_id: string;
  readonly kind: string | null;
  readonly form_id: string | null;
  readonly ring: string | null;
  readonly media_key: string | null;
  readonly moderation_status: string | null;
}

/** Everyone the phone holds a profile for, with the avatar they currently wear. */
export const MEMBER_AVATARS_SQL = `SELECT u.id AS user_id, a.kind, a.form_id, a.ring, a.media_key,
    a.moderation_status
  FROM users u LEFT JOIN avatars a ON a.id = u.avatar_id`;
export const MEMBER_AVATARS_TABLES = ['users', 'avatars'];

function ringOf(raw: string | null): AvatarRing | null {
  return raw === 'rare' || raw === 'epic' || raw === 'legendary' ? raw : null;
}

export function faceOf(row: AvatarRow | undefined, viewerUid: string | null): MemberFace {
  if (row === undefined || row.kind === null) return { kind: 'initials' };
  if (row.kind === 'photo' && row.media_key !== null) {
    const mine = viewerUid !== null && row.user_id === viewerUid;
    const visible =
      row.moderation_status === 'approved' || (mine && row.moderation_status !== 'rejected');
    return visible ? { kind: 'photo', mediaKey: row.media_key } : { kind: 'initials' };
  }
  if (row.kind === 'critter' && row.form_id !== null) {
    const guide = guideOfForm(row.form_id);
    const ring = ringOf(row.ring);
    return guide === null
      ? { kind: 'form', formId: row.form_id, ring }
      : { kind: 'guide', guide, ring };
  }
  return { kind: 'initials' };
}
