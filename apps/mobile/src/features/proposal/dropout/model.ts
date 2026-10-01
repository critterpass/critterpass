/**
 * A dropout's change list as the organiser reads it (3f-7): one row per op the re-split proposes,
 * each with the old value struck and the new one ("split 6 ways → split 5"), and the organiser's
 * own share before and after. Amounts are the cost engine's (the worker stored them); nothing is
 * worked out here but the wording.
 */

import { t } from '@lingui/core/macro';

export interface DropoutOp {
  readonly op: string;
  readonly [key: string]: unknown;
}

export interface MemberResplit {
  readonly uid: string;
  readonly before_minor: string;
  readonly after_minor: string;
  readonly delta_minor: string;
  readonly display_delta_minor: string;
}

export interface ChangeRow {
  readonly key: string;
  readonly title: string;
  /** The old value, struck through; null when the row has none. */
  readonly before: string | null;
  readonly after: string;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

export function changeRows(
  ops: readonly DropoutOp[],
  names: (uid: string) => string,
  label: (componentId: string) => string,
): ChangeRow[] {
  return ops.flatMap((op, index): ChangeRow[] => {
    const key = `${index}-${op.op}`;
    switch (op.op) {
      case 'release_room_bed': {
        const room = str(op['room_key']);
        const before = Array.isArray(op['occupants_before'])
          ? (op['occupants_before'] as unknown[]).map((u) => names(str(u))).join(', ')
          : '';
        return [
          {
            key,
            title: t({ id: 'proposal.dropout.room', message: `Room ${room}` }),
            before,
            after: t({ id: 'proposal.dropout.released', message: 'released' }),
          },
        ];
      }
      case 'move_guest': {
        const who = names(str(op['uid']));
        const to = str(op['to_room']);
        return [
          {
            key,
            title: t({ id: 'proposal.dropout.move', message: `${who} moves` }),
            before: str(op['from_room']),
            after: t({ id: 'proposal.dropout.moveTo', message: `room ${to}` }),
          },
        ];
      }
      case 'resplit_component': {
        const before = num(op['ways_before']);
        const after = num(op['ways_after']);
        return [
          {
            key,
            title: label(str(op['component_id'])),
            before: t({ id: 'proposal.dropout.waysBefore', message: `split ${before} ways` }),
            after: t({ id: 'proposal.dropout.waysAfter', message: `split ${after}` }),
          },
        ];
      }
      case 'withdraw_reminder_entry': {
        const who = names(str(op['uid']));
        return [
          {
            key,
            title: label(str(op['component_id'])),
            before: null,
            after: t({ id: 'proposal.dropout.withdrawn', message: `${who}’s entry is withdrawn` }),
          },
        ];
      }
      case 'cancel_supplier_item': {
        const before = num(op['seats_before']);
        const after = num(op['seats_after']);
        return [
          {
            key,
            title: t({ id: 'proposal.dropout.activity', message: 'Booked activity' }),
            before: t({ id: 'proposal.dropout.seatsBefore', message: `${before} seats` }),
            after: t({
              id: 'proposal.dropout.seatsAfter',
              message: `${after}, cancelled in the booking once you apply`,
            }),
          },
        ];
      }
      case 'change_stay_booking': {
        const supplier = str(op['supplier']);
        return [
          {
            key,
            title: t({ id: 'proposal.dropout.stay', message: 'Your stay' }),
            before: null,
            after: t({
              id: 'proposal.dropout.changeStay',
              message: `Change the booking on ${supplier}; we never change it for you`,
            }),
          },
        ];
      }
      case 'remove_participant_from_item': {
        const who = names(str(op['uid']));
        return [
          {
            key,
            title: t({ id: 'proposal.dropout.planItem', message: 'A plan stop' }),
            before: null,
            after: t({ id: 'proposal.dropout.offItem', message: `${who} comes off it` }),
          },
        ];
      }
      default:
        return [];
    }
  });
}

/** The viewer's own share before and after, when the re-split priced them. */
export function shareChange(
  members: readonly MemberResplit[],
  uid: string,
): { before: number; after: number; delta: number } | null {
  const row = members.find((m) => m.uid === uid);
  if (row === undefined) return null;
  return {
    before: Number(row.before_minor),
    after: Number(row.after_minor),
    delta: Number(row.display_delta_minor),
  };
}
