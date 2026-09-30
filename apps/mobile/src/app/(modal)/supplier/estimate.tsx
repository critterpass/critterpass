import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';

import { EstimateSheet } from '@/features/bookings/getting-around/EstimateSheet';
import type { FareSource } from '@/features/bookings/getting-around/fare-estimate';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

function sourcesFrom(raw: string | undefined): FareSource[] {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown;
    return Array.isArray(value)
      ? (value as FareSource[]).filter((s) => typeof s.name === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Why a fare estimate says what it says: basis, sources, when it was checked. */
export default function EstimateRoute() {
  const { t, i18n } = useLingui();
  const params = useLocalSearchParams<{
    basis?: string;
    sources?: string;
    checked?: string;
    reviewed?: string;
  }>();
  const checked = params.checked
    ? i18n.date(new Date(params.checked), { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'suppliers.estimate.title', message: 'Why this estimate' })}
      testID="supplier-estimate-sheet"
    >
      <SheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <EstimateSheet
          basis={params.basis ?? ''}
          sources={sourcesFrom(params.sources)}
          checked={checked}
          reviewed={params.reviewed === '1'}
        />
      </SheetScrollView>
    </Sheet>
  );
}
