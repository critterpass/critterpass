/**
 * The receipt scan in the premium look: the camera and its sheets, the who-had-it picker, the typed
 * lines, and the two screens before the camera (loading the trip, and no trip to split) as a
 * full-screen cover with its ✕.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBackOr } from '@/lib/navigation/back';
import { EmptyState, Skeleton, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { MONEY_FALLBACK } from '../../routes';
import type { ScanLook } from '../../receipt/ScanScreen';
import { MemberPickerPremium } from './MemberPickerPremium';
import { ScanViewPremium } from './ScanViewPremium';
import { TypeLinesEditorPremium } from './TypeLinesEditorPremium';

function Cover({ crew }: { readonly crew: boolean | null }) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  return (
    <FullScreen
      closeLabel={t({ id: 'money.scan.close', message: 'Close the scan' })}
      overPhoto={false}
      onClose={() => goBackOr(MONEY_FALLBACK)}
      testID={crew === null ? 'money-loading' : crew ? 'money-no-trip' : 'money-no-crew'}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: th.color.ground,
            paddingTop: insets.top + th.size.glassNav + th.space.gap16,
            paddingHorizontal: th.space.gutter,
            gap: th.space.gap12,
          },
        ]}
      >
        {crew === null ? (
          <>
            <Skeleton height={60} radius={th.radius.card} />
            <Skeleton height={240} radius={th.radius.card} />
          </>
        ) : (
          <EmptyState
            title={
              crew
                ? t({ id: 'money.noTrip.title', message: 'No trip to split yet' })
                : t({ id: 'money.noCrew.title', message: 'Money is for crews' })
            }
            line={
              crew
                ? t({
                    id: 'money.noTrip.line',
                    message:
                      'Once the crew has a trip, every expense lands here and I keep the tally.',
                  })
                : t({
                    id: 'money.noCrew.line',
                    message: 'Start or join a crew and I will split every bill with them.',
                  })
            }
          />
        )}
      </View>
    </FullScreen>
  );
}

function ScanLoading() {
  return <Cover crew={null} />;
}

export const PREMIUM_SCAN_LOOK: ScanLook = {
  View: ScanViewPremium,
  Picker: MemberPickerPremium,
  TypeLinesEditor: TypeLinesEditorPremium,
  Loading: ScanLoading,
  NoTrip: Cover,
};

const styles = StyleSheet.create({ root: { flex: 1 } });
