/**
 * A short status word on a planning row (7a-3 BOOKED, CLASH, RAIN, VOTE, TOO FAR; 7c-3 SPLIT;
 * 7b-1 RAIN LIKELY 13–15): filled in the colour that names the state, or quiet on the row.
 */
import { Tag } from '../chips/Tag';

export interface PlanningTagProps {
  readonly label: string;
  /** The fill; absent draws the quiet tag (VOTE). */
  readonly color?: string | undefined;
  readonly testID?: string | undefined;
}

export function PlanningTag({ label, color, testID }: PlanningTagProps) {
  return <Tag label={label} tone="quiet" color={color} testID={testID} />;
}
