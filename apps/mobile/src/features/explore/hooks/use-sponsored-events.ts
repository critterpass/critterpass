/**
 * Counts a sponsored pick being shown and being tapped (`record_sponsored_event`). The count
 * carries the placement and the list only, never who looked. An impression is sent once per
 * placement and list for as long as the screen is mounted.
 */
import { useCallback, useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { recordSponsoredEventCommand } from '../commands';
import { createImpressionGate, type ListKind } from '../sponsored-model';

export function useSponsoredEvents(
  placementId: string | null,
  list: ListKind,
): { readonly click: () => void } {
  const { send } = useCommand(recordSponsoredEventCommand);
  const [firstTime] = useState(createImpressionGate);
  useEffect(() => {
    if (placementId === null || !firstTime(placementId, list)) return;
    void send({ placement_id: placementId, list_kind: list, kind: 'impression' });
  }, [firstTime, list, placementId, send]);
  const click = useCallback(() => {
    if (placementId === null) return;
    void send({ placement_id: placementId, list_kind: list, kind: 'click' });
  }, [list, placementId, send]);
  return { click };
}
