/**
 * The SOS screen's layout (3k-10): the hero, the guide's steps, who is coming, then the actions.
 * A crewmate gets I'M GOING and CALL {NAME}; the sender gets I'M OK and CALL {general}, with the
 * "no one's answered" prompt after two minutes (it never dials by itself). A resolved SOS says so;
 * a stale one asks the sender whether they still need help.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PillButton } from '@/ui/buttons/PillButton';
import { SplitCtaRow } from '@/ui/buttons/SplitCtaRow';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { Stack } from '@/ui/layout/Stack';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { SosHero, type SosHeroProps } from './sos-hero';
import type { SosModel } from './sos-model';
import { ResponderRow, SosSteps, type SosStepsProps } from './sos-steps';

export interface SosViewProps {
  readonly hero: SosHeroProps;
  readonly steps: Omit<SosStepsProps, 'model'>;
  readonly model: SosModel;
  readonly general: string;
  readonly senderPhone: string | null;
  readonly busy: boolean;
  readonly onGoing: () => void;
  readonly onCallSender: () => void;
  readonly onCallGeneral: () => void;
  readonly onOk: () => void;
  /** A crewmate who went says the sender is safe. */
  readonly onSafe: () => void;
  readonly onSendAgain: () => void;
  readonly onClose: () => void;
  /** The session map: where the sender is, and the way there on foot. */
  readonly onMap: () => void;
}

interface Cta {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
  readonly disabled?: boolean;
}

function Pair({ primary, secondary }: { readonly primary: Cta; readonly secondary: Cta | null }) {
  const first = (
    <PillButton
      label={primary.label}
      tone="yellow"
      block
      disabled={primary.disabled ?? false}
      onPress={primary.onPress}
      testID={primary.testID}
    />
  );
  if (secondary === null) return first;
  return (
    <SplitCtaRow
      primary={first}
      secondary={
        <PillButton
          label={secondary.label}
          variant="secondary"
          block
          disabled={secondary.disabled ?? false}
          onPress={secondary.onPress}
          testID={secondary.testID}
        />
      }
    />
  );
}

function Actions(props: SosViewProps) {
  const { t } = useLingui();
  const { model } = props;
  const name = model.senderName;
  const general = props.general;
  const ok: Cta = {
    label: t({ id: 'safety.sos.imOk', message: "I'm OK" }),
    onPress: props.onOk,
    disabled: props.busy,
    testID: 'sos-ok',
  };
  if (model.state === 'resolved') {
    return (
      <PillButton
        label={t({ id: 'safety.sos.close', message: 'Close' })}
        variant="secondary"
        block
        onPress={props.onClose}
        testID="sos-close"
      />
    );
  }
  if (model.state === 'stale') {
    return (
      <Pair
        primary={{
          label: t({ id: 'safety.sos.sendNow', message: 'Send now' }),
          onPress: props.onSendAgain,
          disabled: props.busy,
          testID: 'sos-send-now',
        }}
        secondary={ok}
      />
    );
  }
  if (model.role === 'sender') {
    const call: Cta = {
      label: t({ id: 'safety.sos.callGeneral', message: `Call ${general}` }),
      onPress: props.onCallGeneral,
      testID: 'sos-call-general',
    };
    // Alone on the trip, the local number comes first.
    return model.reachedNobody ? (
      <Pair primary={call} secondary={ok} />
    ) : (
      <Pair primary={ok} secondary={call} />
    );
  }
  const going = model.myResponse === 'coming';
  return (
    <Pair
      primary={{
        label: going
          ? t({ id: 'safety.sos.goingDone', message: 'Going ✓' })
          : t({ id: 'safety.sos.imGoing', message: "I'm going" }),
        onPress: props.onGoing,
        disabled: going || props.busy,
        testID: 'sos-going',
      }}
      secondary={
        props.senderPhone === null
          ? null
          : {
              label: t({ id: 'safety.sos.callName', message: `Call ${name}` }),
              onPress: props.onCallSender,
              testID: 'sos-call-sender',
            }
      }
    />
  );
}

export function SosView(props: SosViewProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { model } = props;
  const name = model.senderName;
  const general = props.general;
  const seen = model.seen;
  return (
    <Scaffold variant="dark" edges={[]} testID="sos-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['24'] }}>
        <SosHero {...props.hero} />
        <Stack gap="16" style={{ padding: theme.size.gutter, paddingTop: theme.space['24'] }}>
          {model.state === 'resolved' ? (
            <Card tone="green" testID="sos-resolved">
              <Text variant="title" color={theme.color.ink['950']}>
                {model.falseAlarm
                  ? t({ id: 'safety.sos.falseAlarm', message: `False alarm: ${name} is OK.` })
                  : t({ id: 'safety.sos.safe', message: `${name} is safe.` })}
              </Text>
            </Card>
          ) : null}
          {model.state === 'stale' ? (
            <Card tone="raised" testID="sos-stale">
              <Text variant="title">
                {t({
                  id: 'safety.sos.staleQuestion',
                  message: "Your SOS didn't reach the crew in time. Are you still in trouble?",
                })}
              </Text>
            </Card>
          ) : null}
          {model.role === 'sender' && model.escalated && !model.reachedNobody ? (
            <Card tone="raised" testID="sos-escalated">
              <Text variant="title">
                {t({
                  id: 'safety.sos.noAnswer',
                  message: `No one's answered yet. Call ${general}?`,
                })}
              </Text>
            </Card>
          ) : null}
          {model.state === 'stale' ? null : <SosSteps model={model} {...props.steps} />}
          {model.role === 'sender' && model.state === 'open' && model.reachedNobody ? (
            <Card tone="raised" testID="sos-nobody">
              <Text variant="title">
                {t({
                  id: 'safety.sos.nobody',
                  message: `Nobody else is in your crew yet. Call ${general} now.`,
                })}
              </Text>
            </Card>
          ) : null}
          {model.role === 'sender' && model.state === 'open' && !model.reachedNobody ? (
            <SecondaryText testID="sos-seen">
              {t({ id: 'safety.sos.seen', message: `Crew alerted · ${seen} seen` })}
            </SecondaryText>
          ) : null}
          {model.responders.map((responder) => (
            <ResponderRow key={responder.uid} responder={responder} />
          ))}
          <Actions {...props} />
          {model.role === 'crew' && model.state === 'open' && model.myResponse === 'coming' ? (
            <TextLink
              label={t({ id: 'safety.sos.theyAreSafe', message: `${name} is safe` })}
              onPress={props.onSafe}
              testID="sos-safe"
            />
          ) : null}
          {model.state === 'open' && model.role === 'crew' ? (
            <TextLink
              label={t({ id: 'safety.sos.seeOnMap', message: `See ${name} on the map` })}
              onPress={props.onMap}
              testID="sos-map-link"
            />
          ) : null}
          <SecondaryText>
            {t({
              id: 'safety.help.disclaimer',
              message: `CritterPass tells your crew. For emergencies call ${general}.`,
            })}
          </SecondaryText>
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}
