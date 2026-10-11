/** The boost sheet (4b-3) on the current UI: the shared boost flow in a sheet. */
import { useLingui } from '@lingui/react/macro';

import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';
import { useTheme } from '@/ui/theme';

import { BoostView } from './boost-view';
import { useBoostScreen } from './use-boost-screen';

export function BoostScreen() {
  const { t } = useLingui();
  const theme = useTheme();
  const props = useBoostScreen();
  return (
    <Sheet
      detents={['fit']}
      accessibilityLabel={t({ id: 'monetize.boost.sheet', message: 'Boost this trip' })}
      testID="boost-sheet"
    >
      <SheetScrollView
        contentContainerStyle={{ padding: theme.size.gutter, paddingBottom: theme.space['32'] }}
      >
        <BoostView {...props} />
      </SheetScrollView>
    </Sheet>
  );
}
