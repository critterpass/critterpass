import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';

import { EstimateSheet } from '@/features/bookings/getting-around/EstimateSheet';
import { parseEstimateOption } from '@/features/bookings/getting-around/routes';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

/** Why a fare estimate says what it says: basis, sources, when checked, whether reviewed. */
export default function EstimateRoute() {
  const { t, i18n } = useLingui();
  const params = useLocalSearchParams<{ option?: string }>();
  const option = parseEstimateOption(params.option);
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'suppliers.estimate.title', message: 'Why this estimate' })}
      testID="supplier-estimate-sheet"
    >
      <SheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {option === null ? null : (
          <EstimateSheet
            option={option}
            date={(iso) =>
              i18n.date(new Date(iso), { day: 'numeric', month: 'short', year: 'numeric' })
            }
          />
        )}
      </SheetScrollView>
    </Sheet>
  );
}
