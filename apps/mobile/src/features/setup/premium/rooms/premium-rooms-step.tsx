/** The rooms step drawn in the premium look: the shared connected step with the premium pages. */
import type { StepProps } from '../../shell/frame';
import { RoomsStep } from '../../rooms/rooms-step';
import { RoomsPremiumView } from './rooms-premium-view';

export function PremiumRoomsStep(props: StepProps) {
  return <RoomsStep {...props} View={RoomsPremiumView} />;
}
