/**
 * Room changes of a dropout as ChangeSet ops: the leaver's bed is released (a room left empty is
 * released whole) and a guest left alone moves in with someone, as the cost engine re-packed them.
 */
import type { DropoutChange } from '@cp/cost-engine';
import type { ProposalOp } from '@cp/domain';

export function roomOps(changes: readonly DropoutChange[]): ProposalOp[] {
  const ops: ProposalOp[] = [];
  for (const change of changes) {
    if (change.kind === 'room_released') {
      ops.push({
        op: 'release_room_bed',
        stay_id: change.stayId,
        room_key: change.roomKey,
        occupants_before: [...change.occupantsBefore],
      });
    } else if (change.kind === 'guest_moved') {
      ops.push({
        op: 'move_guest',
        stay_id: change.stayId,
        uid: change.uid,
        from_room: change.fromRoom,
        to_room: change.toRoom,
      });
    }
  }
  return ops;
}
