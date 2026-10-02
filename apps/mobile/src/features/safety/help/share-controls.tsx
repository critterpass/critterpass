/**
 * The Help share's controls (designed in code): while the crew can see the traveller, until when,
 * STOP and +1 H; otherwise "Share my location · 1 h", or "Share needs location" with a way to
 * Settings when the phone has no location permission. Dialing and texting never depend on it.
 */
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';

import { clockTime } from '../format';
import type { ShareView } from './share-policy';

export interface ShareControlsProps {
  readonly crewName: string;
  readonly share: ShareView | null;
  /** The phone has no location permission (the share would have nothing to send). */
  readonly locationDenied: boolean;
  /** +1 H would pass the 3-hour cap. */
  readonly extendCapped: boolean;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onExtend: () => void;
  readonly onSettings: () => void;
}

export function ShareControls(props: ShareControlsProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const { share, crewName } = props;

  if (props.locationDenied) {
    return (
      <Card tone="raised" testID="help-share-denied">
        <Row gap="12" align="center">
          <Stack gap="2" flex={1}>
            <Text variant="title">
              {t({ id: 'safety.share.denied', message: 'Share needs location' })}
            </Text>
            <SecondaryText>
              {t({
                id: 'safety.share.deniedLine',
                message: 'Calling and texting still work without it.',
              })}
            </SecondaryText>
          </Stack>
          <InlineAction
            label={t({ id: 'safety.share.settings', message: 'Settings' })}
            onPress={props.onSettings}
            testID="help-share-settings"
          />
        </Row>
      </Card>
    );
  }

  if (share === null) {
    return (
      <PillButton
        label={t({ id: 'safety.share.start', message: 'Share my location · 1 h' })}
        variant="secondary"
        block
        loading={props.busy}
        onPress={props.onStart}
        testID="help-share-start"
      />
    );
  }

  const until = clockTime(share.endsAt, locale);
  return (
    <Card tone="raised" testID="help-share-active">
      <Row gap="12" align="center">
        <Stack gap="2" flex={1}>
          <Text variant="title">
            {crewName === ''
              ? t({ id: 'safety.share.activeCrew', message: 'Your crew can see where you are' })
              : t({ id: 'safety.share.active', message: `${crewName} can see where you are` })}
          </Text>
          <SecondaryText>
            {share.shareId === null
              ? t({ id: 'safety.share.starting', message: 'Starting as soon as you have signal' })
              : t({ id: 'safety.share.until', message: `Until ${until}, then it stops by itself` })}
          </SecondaryText>
        </Stack>
        <InlineAction
          label={t({ id: 'safety.share.extend', message: '+1 h' })}
          kind="ghost"
          disabled={share.shareId === null || props.extendCapped || props.busy}
          onPress={props.onExtend}
          testID="help-share-extend"
        />
        <InlineAction
          label={t({ id: 'safety.share.stop', message: 'Stop' })}
          disabled={share.shareId === null || props.busy}
          onPress={props.onStop}
          testID="help-share-stop"
        />
      </Row>
    </Card>
  );
}
