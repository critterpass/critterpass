/**
 * DROP A PIN's state: where the pin stands as the map moves
 * under it, the name, and ADD TO IDEAS saving it to the trip's Ideas as a pin (`save_idea{pin}`),
 * which works offline from the queue.
 */
import { generateUuidV7 } from '@cp/domain';
import type { LngLat } from '@maplibre/maplibre-react-native';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { saveIdeaCommand } from './commands';
import { useDestinationCentre } from './use-addresses';

export interface DropPinInput {
  readonly tripId: string;
  readonly destinationId: string | null;
  /** Where the pin starts (the search's scope), else the middle of the destination's places. */
  readonly start: { readonly lat: number; readonly lng: number } | null;
  readonly name: string;
  readonly onSaved: (name: string) => void;
}

export function useDropPin(input: DropPinInput) {
  const save = useCommand(saveIdeaCommand);
  const centre = useDestinationCentre(input.destinationId);
  const start = input.start ?? centre;
  const [point, setPoint] = useState<LngLat | null>(null);
  const [name, setName] = useState(input.name);
  const at: LngLat | null = point ?? (start === null ? null : [start.lng, start.lat]);
  const canAdd = at !== null && name.trim() !== '';
  const add = () => {
    if (at === null || name.trim() === '') return;
    void save.send({
      idea_id: generateUuidV7(),
      trip_id: input.tripId,
      pin: { name: name.trim(), lat: at[1], lng: at[0] },
      source: 'pin',
    });
    input.onSaved(name.trim());
  };
  return { start, name, setName, setPoint, canAdd, add };
}
