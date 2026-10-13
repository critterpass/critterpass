import { deviceDraftServices, DraftServicesProvider } from '@/features/plan/draft';
import { sheetRouteOptions } from '@/ui/premium/shell';
import { PremiumStack, PremiumStackScreen } from '@/ui/premium/shell/navigation/premium-stack';

/**
 * The private draft: drafting, the draft, a redraft as native pushes with the glass back;
 * change-a-day and the last redraft as native form sheets.
 */
export default function DraftLayout() {
  return (
    <DraftServicesProvider services={deviceDraftServices}>
      <PremiumStack>
        <PremiumStackScreen name="change-day" options={sheetRouteOptions('full')} />
        <PremiumStackScreen name="last-redraft" options={sheetRouteOptions('fit')} />
      </PremiumStack>
    </DraftServicesProvider>
  );
}
