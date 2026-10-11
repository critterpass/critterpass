/**
 * Food and access needs, premium (5.21, 5.22): consent first for someone who has never shared
 * (Share flags grants it and opens the form with sharing on; Not now goes back with nothing
 * shared; Keep it to myself opens the form unshared), then the form. Save goes through the
 * offline queue; leaving with edits asks first.
 */
import { t } from '@lingui/core/macro';
import { router, Stack } from 'expo-router';
import { useContext, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { useAnimatedReaction } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { Button, LoadingCritter, Text, usePremiumTheme } from '@/ui/premium';
import { FullScreen, useDirtySheetGuard, useKeyboardFrame } from '@/ui/premium/shell';

import type { DietaryServices } from '../../dietary/dietary-data';
import { useDietaryForm } from '../../dietary/use-dietary-form';
import { DietaryConsent } from './dietary-consent';
import { DietaryForm } from './dietary-form';

export function PremiumDietaryScreen({ services }: { readonly services: DietaryServices }) {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) {
    return (
      <LoadingCritter
        label={t({ id: 'guide.premium.dietary.opening', message: 'Opening your food needs…' })}
        testID="guide-dietary-waiting"
      />
    );
  }
  return <OpenDietary services={services} />;
}

function OpenDietary({ services }: { readonly services: DietaryServices }) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const form = useDietaryForm(services);
  const [step, setStep] = useState<'consent' | 'form' | null>(null);
  const [grant, setGrant] = useState(false);
  const keyboardUp = useKeyboardUp();
  const guard = useDirtySheetGuard(form.dirty, {
    title: t({ id: 'guide.premium.dietary.discard', message: 'Discard your changes?' }),
    message: t({ id: 'guide.premium.dietary.discardLine', message: 'What you changed goes.' }),
    discard: t({ id: 'guide.premium.dietary.discardYes', message: 'Discard' }),
    keep: t({ id: 'guide.premium.dietary.keep', message: 'Keep editing' }),
  });
  const shown = step ?? (form.consented || form.wasSharing ? 'form' : 'consent');
  const close = t({ id: 'guide.premium.dietary.close', message: 'Close' });

  if (shown === 'consent') {
    return (
      <FullScreen closeLabel={close} overPhoto={false} testID="guide-dietary-sheet">
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: th.color.ground }}>
          <DietaryConsent
            onShare={() => {
              form.edit({ ...form.profile, visibility: 'crew_flags' });
              setGrant(true);
              setStep('form');
            }}
            onNotNow={() => router.back()}
            onJustMe={() => setStep('form')}
          />
        </View>
      </FullScreen>
    );
  }
  return (
    <FullScreen closeLabel={close} overPhoto={false} testID="guide-dietary-sheet">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: th.color.ground }}>
        <DietaryForm
          profile={form.profile}
          onChange={form.edit}
          onShareChange={(share) => {
            if (share && !form.consented && !form.wasSharing) setGrant(true);
            form.edit({ ...form.profile, visibility: share ? 'crew_flags' : 'self' });
          }}
        />
        {keyboardUp ? null : (
          <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 12, gap: 6 }}>
            {form.saved ? (
              <Text
                variant="captionMuted"
                align="center"
                color={th.color.status.booked.text}
                testID="guide-dietary-saved"
              >
                {t({ id: 'guide.dietary.saved', message: 'Saved. The guide plans around it.' })}
              </Text>
            ) : null}
            <Button
              label={t({ id: 'guide.dietary.save', message: 'Save' })}
              loading={form.saving}
              onPress={() => {
                Keyboard.dismiss();
                const sharing = form.profile.visibility === 'crew_flags';
                void guard.commit(() => form.save(form.profile, grant && sharing));
                setGrant(false);
              }}
              testID="guide-dietary-save"
            />
          </View>
        )}
      </View>
    </FullScreen>
  );
}

/** Whether the keyboard is up: Save hides under it rather than riding it (the form scrolls). */
function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  const { height } = useKeyboardFrame();
  useAnimatedReaction(
    () => height.value > 0,
    (now, before) => {
      if (now !== before) scheduleOnRN(setUp, now);
    },
  );
  return up;
}
