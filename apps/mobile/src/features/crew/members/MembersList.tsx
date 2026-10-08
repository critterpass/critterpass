/**
 * A crew's members in join order with their colour (accent, and a dashed or double ring from the
 * seventh member on), their role and, for someone who manages the crew, a Remove action behind a
 * confirmation. The crew's creator and the caller themselves are never removable here.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';

import { parseMemberColour, type MemberRingPattern } from '@cp/domain';

import { Avatar } from '@/ui/people/Avatar';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import { rowId } from '../crews-sheet/crew-commands';
import type { CrewMemberRow } from '../crews-sheet/crew-data';
import { memberFirstName } from '@/ui/people/member-name';

export interface MembersListProps {
  readonly members: readonly CrewMemberRow[];
  readonly uid: string | null;
  readonly createdBy: string | null;
  readonly canManage: boolean;
  readonly onRemove: (uid: string) => void;
}

function firstName(name: string | null): string {
  return memberFirstName(name);
}

export function ringLabel(colour: string | null): string {
  const parsed = parseMemberColour(colour);
  if (parsed === null) return '';
  const labels: Readonly<Record<MemberRingPattern, string>> = {
    solid: '',
    dashed: t({ id: 'crew.members.ringDashed', message: 'dashed ring' }),
    double: t({ id: 'crew.members.ringDouble', message: 'double ring' }),
  };
  return labels[parsed.ring];
}

export function MembersList({ members, uid, createdBy, canManage, onRemove }: MembersListProps) {
  const [removing, setRemoving] = useState<CrewMemberRow | null>(null);
  const rows: SettingsRow[] = members.map((member, index) => {
    const name = firstName(member.display_name);
    const role =
      member.role === 'organiser'
        ? t({ id: 'crew.members.organiser', message: 'Organiser' })
        : t({ id: 'crew.members.member', message: 'Member' });
    const ring = ringLabel(member.colour);
    return {
      key: member.user_id,
      kind: 'custom',
      title: name,
      subtitle: ring === '' ? role : `${role} · ${ring}`,
      trailing: <Avatar name={name} joinIndex={index} size="sm" decorative uid={member.user_id} />,
    };
  });
  const removeRows: SettingsRow[] = canManage
    ? members
        .filter((m) => m.user_id !== uid && m.user_id !== createdBy)
        .map((m) => {
          const name = firstName(m.display_name);
          return {
            key: rowId('remove', m.user_id),
            kind: 'destructive',
            title: t({ id: 'crew.members.remove', message: `Remove ${name}` }),
            onPress: () => setRemoving(m),
          };
        })
    : [];
  const removingName = firstName(removing?.display_name ?? null);
  return (
    <>
      <SettingsGroup
        title={t({ id: 'crew.members.title', message: 'Members' })}
        rows={rows}
        testID="crew-members"
      />
      {removeRows.length > 0 ? (
        <SettingsGroup rows={removeRows} testID="crew-members-remove" />
      ) : null}
      {removing !== null ? (
        <ConfirmSheet
          title={t({ id: 'crew.members.removeTitle', message: `Remove ${removingName}?` })}
          consequences={[
            t({
              id: 'crew.members.removeTrips',
              message: 'They leave the crew’s trips; their seat opens for the waitlist.',
            }),
            t({
              id: 'crew.members.removeAccess',
              message: 'They stop seeing the crew’s chat, plans and money right away.',
            }),
          ]}
          confirmLabel={t({ id: 'crew.members.removeConfirm', message: 'Remove' })}
          mode="button"
          onConfirm={() => {
            onRemove(removing.user_id);
            setRemoving(null);
          }}
          onCancel={() => setRemoving(null)}
          testID="crew-remove-confirm"
        />
      ) : null}
    </>
  );
}
