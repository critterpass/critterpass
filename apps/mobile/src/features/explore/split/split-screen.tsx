/**
 * Crew can't agree (7e-3): the stances live from the synced rows, so another phone's stance shows
 * as soon as it syncs; the guide's two ways from the api, worked out again whenever a stance
 * changes; and SUGGEST or "Put it to a vote" posting a decision vote to crew chat.
 */
import { SplitView } from './split-view';
import { StancePicker } from './stance-picker';
import { useSplit } from './use-split';

export function SplitScreen({
  tripId,
  placeId,
}: {
  readonly tripId: string;
  readonly placeId: string;
}) {
  const { view, picker } = useSplit({ tripId, placeId });
  const pickerKey = `${picker.mine?.stance ?? 'none'}:${picker.mine?.note ?? ''}`;
  return (
    <SplitView
      {...view}
      picker={
        <StancePicker
          key={pickerKey}
          mine={picker.mine}
          busy={picker.busy}
          onSay={picker.onSay}
          onClear={picker.onClear}
        />
      }
    />
  );
}
