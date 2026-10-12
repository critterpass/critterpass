/**
 * The storm screen (3k-8): its data and actions are `useStormScreen`.
 */
import { StormView } from './storm-view';
import { useStormScreen } from './use-storm-screen';

export function StormScreen({ pollId }: { readonly pollId: string }) {
  return <StormView {...useStormScreen({ pollId })} />;
}
