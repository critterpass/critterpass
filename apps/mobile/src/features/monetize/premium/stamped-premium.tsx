import { useStampedScreen } from '../boost/use-stamped-screen';
import { useBillingRows } from '../data/use-billing-rows';
import { perkLines } from '../perks/perk-copy';
import { StampedPremiumView } from './stamped-premium-view';

/** Boosted · the entry stamp (9.14) over the synced boost. */
export function StampedPremium() {
  const props = useStampedScreen();
  const rows = useBillingRows();
  return <StampedPremiumView props={props} perks={perkLines(rows.perks, 'boost').slice(0, 4)} />;
}
