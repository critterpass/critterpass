/**
 * Pick {name}: which legs? (6d-2), a sheet over the comparison. SET writes him onto the days at
 * once; on a crew trip "Ask the crew first" puts the same pick to the crew as a vote (a change
 * set that sets him on the days when it passes). "Tell {name} on WhatsApp" opens the days and
 * pickup pins in the traveller's WhatsApp after SET. A day longer than the hours his price covers
 * shows the overtime warning; a refused pick says why. Opened from a driver's reply, the pick
 * carries his quote as the terms the crew votes on.
 */
import { PickDaysView } from './PickDaysView';
import type { PickDaysProps } from './use-pick-days';
import { usePickDaysView } from './use-pick-days-view';

export function PickDaysSheet(props: PickDaysProps) {
  return <PickDaysView {...usePickDaysView(props)} />;
}
