/**
 * The crew area's commands as the client sends them: switching, starting, renaming and muting a
 * crew wait in the offline queue; rotating the code, leaving, removing someone and answering an
 * in-app invite need the server's answer.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  CreateCrewPayload,
  CrewIdPayload,
  InviteIdPayload,
  LeaveCrewPayload,
  RemoveMemberPayload,
  SetCrewNotifyPayload,
  TransferOrganiserPayload,
  UpdateCrewPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const SET_ACTIVE_CREW = defineClientCommand<CrewIdPayload>({
  name: 'set_active_crew',
  offline: true,
});

export const CREATE_CREW = defineClientCommand<CreateCrewPayload>({
  name: 'create_crew',
  offline: true,
  summarize: (p) => msg({ id: 'crew.queued.create', message: `New crew: ${p.name}` }),
});

export const UPDATE_CREW = defineClientCommand<UpdateCrewPayload>({
  name: 'update_crew',
  offline: true,
  summarize: () => msg({ id: 'crew.queued.rename', message: 'Crew name change' }),
});

export const SET_CREW_NOTIFY = defineClientCommand<SetCrewNotifyPayload>({
  name: 'set_crew_notify',
  offline: true,
  summarize: () => msg({ id: 'crew.queued.notify', message: 'Crew notification setting' }),
});

export const ROTATE_JOIN_CODE = defineClientCommand<{ crew_id: string; trip_id?: string }>({
  name: 'rotate_join_code',
  offline: false,
});

export const LEAVE_CREW = defineClientCommand<LeaveCrewPayload>({
  name: 'leave_crew',
  offline: false,
});

export const REMOVE_MEMBER = defineClientCommand<RemoveMemberPayload>({
  name: 'remove_member',
  offline: false,
});

export const TRANSFER_ORGANISER = defineClientCommand<TransferOrganiserPayload>({
  name: 'transfer_organiser',
  offline: false,
});

export const ACCEPT_INVITE = defineClientCommand<InviteIdPayload>({
  name: 'accept_invite',
  offline: false,
});

/** A de-dupe id for a toast or list key about one row (never shown). */
export function rowId(kind: string, id: string): string {
  return `${kind}-${id}`;
}

export const DEFER_INVITE = defineClientCommand<InviteIdPayload>({
  name: 'defer_invite',
  offline: false,
});
