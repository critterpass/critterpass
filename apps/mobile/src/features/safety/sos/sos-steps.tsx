/**
 * "{GUIDE}'S ON IT" (3k-10): what has really happened, each row a dashed pending circle until its
 * event lands, then a green tick. The crew is told; the clinic is called by a person on the ops
 * desk, never by the app; insurance details go only after the sender says yes. Below it, who is
 * coming and how far away they are on foot.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { SosModel, SosResponder, SosStepView } from './sos-model';

const useStyles = makeStyles((t) => ({
  tick: {
    width: t.space['24'],
    height: t.space['24'],
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: { borderWidth: 2, borderStyle: 'dashed' },
  initial: {
    width: t.space['24'],
    height: t.space['24'],
    borderRadius: t.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export interface SosStepsProps {
  readonly model: SosModel;
  readonly guideName: string;
  readonly guideSticker: { readonly kind: string; readonly name: string };
}

function StepRow({ step, text }: { readonly step: SosStepView; readonly text: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Row gap="12" align="center" testID={`sos-step-${step.key}`}>
      {step.done ? (
        <View style={[styles.tick, { backgroundColor: theme.color.green.base }]}>
          <Icon name="check" size={16} color={theme.color.ink['950']} decorative />
        </View>
      ) : (
        <View
          style={[styles.tick, styles.pending, { borderColor: theme.semantic.text.secondary }]}
        />
      )}
      <Stack flex={1}>
        <Text variant="body" color={step.done ? undefined : theme.semantic.text.secondary}>
          {text}
        </Text>
      </Stack>
    </Row>
  );
}

export function SosSteps({ model, guideName, guideSticker }: SosStepsProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const name = model.senderName;
  const textFor = (step: SosStepView): string => {
    switch (step.key) {
      case 'sent': {
        const n = step.n ?? 0;
        return step.done
          ? t({ id: 'safety.sos.stepSent', message: `SOS sent to all ${n} of you` })
          : t({ id: 'safety.sos.stepSending', message: 'Sending the SOS to the crew' });
      }
      case 'location_live':
        return model.role === 'sender'
          ? t({
              id: 'safety.sos.stepLiveYou',
              message: 'Your location stays live until you are safe',
            })
          : t({
              id: 'safety.sos.stepLive',
              message: `${name}'s location stays live until they are safe`,
            });
      case 'ops_clinic':
        return t({
          id: 'safety.sos.stepClinic',
          message: 'Ops desk is calling the clinic with you',
        });
      case 'insurance':
        return step.done
          ? t({
              id: 'safety.sos.stepInsuranceSent',
              message: 'Insurance details went to the clinic',
            })
          : t({ id: 'safety.sos.stepInsurance', message: 'Insurance details wait for a yes' });
    }
  };
  return (
    <Card tone="raised" testID="sos-steps">
      <Stack gap="14">
        <Row gap="10" align="center">
          <Sticker kind={guideSticker.kind} name={guideSticker.name} size={32} />
          <Text variant="label">
            {upper(t({ id: 'safety.sos.onIt', message: `${guideName}'s on it` }), locale)}
          </Text>
        </Row>
        {model.steps.map((step) => (
          <StepRow key={step.key} step={step} text={textFor(step)} />
        ))}
      </Stack>
    </Card>
  );
}

export function ResponderRow({ responder }: { readonly responder: SosResponder }) {
  const { t } = useLingui();
  const theme = useTheme();
  const styles = useStyles();
  const who = responder.name;
  const eta = responder.etaMin;
  const line = responder.arrived
    ? t({ id: 'safety.sos.arrived', message: `${who} is there.` })
    : eta === null
      ? t({ id: 'safety.sos.going', message: `${who} is going.` })
      : t({ id: 'safety.sos.goingEta', message: `${who} is going. ${eta} minutes away on foot.` });
  return (
    <Row gap="10" align="center" testID={`sos-responder-${responder.uid}`}>
      <View style={[styles.initial, { backgroundColor: theme.color.blue }]}>
        <Text variant="label" color={theme.color.ink['950']}>
          {who.slice(0, 1).toLocaleUpperCase()}
        </Text>
      </View>
      <Stack flex={1}>
        <Text variant="body">{line}</Text>
      </Stack>
    </Row>
  );
}
