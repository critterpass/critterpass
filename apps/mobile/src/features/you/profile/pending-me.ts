/**
 * The person's own name and avatar as changed on this phone and not yet synced back
 * (`data/pending-edits`): the profile and every drawn face of the person read these first.
 */
import type { AvatarRow } from '../avatar/member-face';

export const PENDING_ME = 'me';

/** The avatar picked on this phone, in the synced row's own columns. */
export type PendingAvatar = Pick<AvatarRow, 'kind' | 'form_id' | 'ring' | 'media_key'>;

export interface PendingMe {
  readonly name: string;
  readonly avatar: PendingAvatar;
}

type Worn = Pick<AvatarRow, 'kind' | 'form_id' | 'media_key'>;

/** The synced avatar row wears what was picked (no row, or any other kind, is initials). */
export function wearsPending(row: Worn | undefined, pending: Worn): boolean {
  const kindOf = (kind: string | null | undefined) =>
    kind === 'critter' || kind === 'photo' ? kind : 'initials';
  const kind = kindOf(pending.kind);
  if (kindOf(row?.kind) !== kind) return false;
  if (kind === 'critter') return row?.form_id === pending.form_id;
  return kind === 'photo' ? row?.media_key === pending.media_key : true;
}
