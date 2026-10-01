/**
 * ADD TO DAY: puts the place in the plan at the suggested slot. The organiser's add is a direct
 * plan edit; a member's is the same addition sent to the crew to okay. Either may wait in the
 * offline queue, so the button turns at once and a toast says which it was; a refusal says so and
 * leaves the button as it was.
 */
import { generateStableId, generateUuidV7, type PlaceContextWire } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useCallback, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { impact, toast } from '@/motion';

import { applyPlanOpsCommand, createChangesetCommand, sendChangesetCommand } from '../commands';
import { addChangeSetOp, addPlanOp, type PlaceToAdd } from '../place-model';

export interface AddToDay {
  /** The day this screen added (or proposed) the place for; null until it has. */
  readonly addedDay: number | null;
  /** True when the add went to the crew as a suggestion rather than into the plan. */
  readonly proposed: boolean;
  readonly busy: boolean;
  readonly add: () => void;
}

export function useAddToDay(input: {
  readonly context: PlaceContextWire | null;
  readonly place: (PlaceToAdd & { readonly name: string }) | null;
  /** Everyone the change touches when it goes to the crew. */
  readonly crew: readonly string[];
}): AddToDay {
  const { t } = useLingui();
  const { context, place, crew } = input;
  const apply = useCommand(applyPlanOpsCommand);
  const create = useCommand(createChangesetCommand);
  const send = useCommand(sendChangesetCommand);
  const [added, setAdded] = useState<{ day: number; proposed: boolean } | null>(null);

  const add = useCallback(() => {
    const slot = context?.suggested_slot ?? null;
    const base = context?.base_version ?? null;
    if (context === null || place === null || slot === null || base === null) return;
    const stableId = generateStableId();
    const day = slot.day_no;
    const name = place.name;
    const refused = () => {
      setAdded(null);
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `explore-add-refused-${stableId}`,
        title: t({ id: 'explore.add.refused', message: "That didn't go through" }),
        subtitle: t({
          id: 'explore.add.refusedBody',
          message: 'The plan is unchanged. Try again.',
        }),
      });
    };
    void (async () => {
      if (context.add_mode === 'apply') {
        setAdded({ day, proposed: false });
        const result = await apply.send({
          trip_id: context.trip_id,
          base_version: base,
          ops: [addPlanOp(slot, place, stableId)],
          confirm_locked: false,
        });
        if (result.kind === 'rejected' || result.kind === 'unavailable') return refused();
        impact('success');
        toast.show({
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
          id: `explore-added-${stableId}`,
          title: t({ id: 'explore.add.done', message: `${name}'s in the plan for Day ${day}` }),
        });
        return undefined;
      }
      setAdded({ day, proposed: true });
      const changesetId = generateUuidV7();
      const created = await create.send({
        changeset_id: changesetId,
        trip_id: context.trip_id,
        base_version: base,
        ops: [
          addChangeSetOp(
            slot,
            place,
            stableId,
            crew,
            t({ id: 'explore.add.reason', message: `Added ${name} from Explore` }),
          ),
        ],
        source: 'user',
        trigger: 'manual',
      });
      if (created.kind === 'rejected' || created.kind === 'unavailable') return refused();
      const sent = await send.send({ changeset_id: changesetId });
      if (sent.kind === 'rejected' || sent.kind === 'unavailable') return refused();
      impact('success');
      toast.show({
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never copy.
        id: `explore-proposed-${stableId}`,
        title: t({ id: 'explore.add.proposed', message: `${name} suggested for Day ${day}` }),
        subtitle: t({ id: 'explore.add.proposedBody', message: 'The crew gets to okay it.' }),
      });
      return undefined;
    })();
  }, [apply, context, create, crew, place, send, t]);

  return {
    addedDay: added?.day ?? null,
    proposed: added?.proposed ?? false,
    busy: apply.pending || create.pending || send.pending,
    add,
  };
}
