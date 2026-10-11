/**
 * Scan QR on Join a crew (2.16): the back camera takes one photo, read for an invite on the phone,
 * and a found invite fills the code as a paste would (a seat link opens its ticket). A QR that is
 * not an invite, or a camera that is off, says so under the button. Absent where the phone has no
 * barcode reader.
 */
import { t } from '@lingui/core/macro';
import { useContext, useState } from 'react';
import { View } from 'react-native';

import { Button, Text } from '@/ui/premium';

import type { ScanOutcome } from '../../invited/scan-code';
import { OnboardingServicesContext } from '../../services';

export function ScanQrButton({ onInvite }: { readonly onInvite: (text: string) => void }) {
  const scan = useContext(OnboardingServicesContext)?.scanInvite;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Exclude<
    ScanOutcome['kind'],
    'invite' | 'cancelled'
  > | null>(null);
  if (scan === undefined) return null;
  const run = () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    void scan().then((outcome) => {
      setBusy(false);
      if (outcome.kind === 'invite') onInvite(outcome.text);
      else if (outcome.kind !== 'cancelled') setProblem(outcome.kind);
    });
  };
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Button
        label={t({ id: 'onboarding.premium.code.scan', message: 'Scan QR' })}
        variant="secondary"
        size="small"
        icon="camera"
        loading={busy}
        onPress={run}
        testID="invite-code-scan"
      />
      {problem === null ? null : (
        <Text variant="caption" tone="muted" align="center" testID="invite-code-scan-problem">
          {problem === 'not_invite'
            ? t({
                id: 'onboarding.premium.code.scanNotInvite',
                message: 'That QR isn’t a crew invite. Try the one your crew shared.',
              })
            : t({
                id: 'onboarding.premium.code.scanDenied',
                message: 'The camera is off for CritterPass. Type the code instead.',
              })}
        </Text>
      )}
    </View>
  );
}
