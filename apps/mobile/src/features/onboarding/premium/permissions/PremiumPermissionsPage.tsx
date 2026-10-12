/**
 * 2.13 "Three things, and why": alarms and pings, location on trips, calendar, each a card with its
 * art and why; a tap asks (this page is the primer). Granted, the card stays as drawn (no tick: the design keeps
 * the three asks calm, and the card still says it to assistive tech); refused,
 * the card greys out and says it will ask again on the trip, with the way to Settings. Let's go
 * and "Ask me later" both finish.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  Button,
  CritterSticker,
  GuideNote,
  PressableScale,
  Spinner,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { guideFacts } from '../../guide-faces';
import { usePermissionsStep } from '../../permissions/use-permissions-step';
import { usePrimerToggle } from '../../permissions/use-primer-toggle';
import { WizardHeader } from '../components/WizardHeader';
import { WizardPage } from '../components/WizardPage';
import { tilt } from '../components/tilt';

const KINDS = ['notifications', 'location', 'calendar'] as const;

function Art({ kind }: { readonly kind: (typeof KINDS)[number] }) {
  const theme = usePremiumTheme();
  const tokek = guideFacts('tokek');
  const tile = {
    width: 84,
    height: 84,
    borderRadius: theme.radius.banner,
    overflow: 'hidden' as const,
  };
  if (kind === 'notifications') {
    return (
      <View
        style={[
          tile,
          {
            backgroundColor: theme.color.ink,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: tilt(-4) }],
          },
        ]}
      >
        <Text variant="badge" tone="onInk" style={{ opacity: 0.7 }}>
          {t({ id: 'onboarding.premium.permissions.leaveBy', message: 'LEAVE BY' })}
        </Text>
        <Text variant="stat" tone="onInk">
          03:10
        </Text>
      </View>
    );
  }
  if (kind === 'location') {
    return (
      <View
        style={[
          tile,
          {
            backgroundColor: theme.color.status.booked.bg,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: tilt(3) }],
          },
        ]}
      >
        <CritterSticker kind={tokek.kind} name={tokek.name} size={70} edge={false} />
      </View>
    );
  }
  return (
    <View
      style={[
        tile,
        {
          backgroundColor: theme.color.card,
          borderWidth: 1.5,
          borderColor: theme.color.fieldBorder,
          transform: [{ rotate: tilt(-2) }],
        },
      ]}
    >
      <View
        style={{
          height: 24,
          backgroundColor: theme.accent.pink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="badge" tone="onAccent">
          {t({ id: 'onboarding.premium.permissions.month', message: 'APR' })}
        </Text>
      </View>
      <Text variant="stat" align="center" style={{ marginTop: 6 }}>
        2
      </Text>
    </View>
  );
}

function AskCard({ kind }: { readonly kind: (typeof KINDS)[number] }) {
  const theme = usePremiumTheme();
  const ask = usePrimerToggle(kind);
  const badge: ReactNode = ask.busy ? (
    <Spinner color={theme.color.ink} trackColor={theme.color.control} />
  ) : null;
  return (
    <PressableScale
      onPress={ask.refused ? ask.openSettings : ask.ask}
      accessibilityRole="button"
      accessibilityLabel={`${ask.copy.title}. ${ask.copy.body}`}
      accessibilityState={{ checked: ask.on, busy: ask.busy }}
      testID={`primer-${kind}`}
    >
      <View
        style={{
          borderRadius: theme.radius.cardRow,
          backgroundColor: theme.color.card,
          boxShadow: theme.shadow.card,
          padding: theme.space.gap14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space.gap14,
          opacity: ask.refused ? 0.45 : 1,
        }}
      >
        <View>
          <Art kind={kind} />
          <View style={{ position: 'absolute', right: -6, top: -6 }}>{badge}</View>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">{ask.copy.title}</Text>
          <Text variant="caption" tone="muted" style={{ fontWeight: '400' }}>
            {ask.refused
              ? t({
                  id: 'onboarding.premium.permissions.off',
                  message: 'Off. I’ll ask on your trip, or turn it on in Settings.',
                })
              : ask.copy.body}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

export function PremiumPermissionsPage() {
  const theme = usePremiumTheme();
  const step = usePermissionsStep();
  const tokek = guideFacts('tokek');
  return (
    <WizardPage
      backLabel={t({ id: 'permissions.primer.back', message: 'Your pass' })}
      header={
        <WizardHeader
          label={t({ id: 'permissions.primer.lastStep', message: 'Last step' })}
          backLabel={t({ id: 'permissions.primer.back', message: 'Your pass' })}
          onBack={step.back}
        />
      }
      testID="permissions-primer"
      footer={
        <>
          <Button
            label={t({ id: 'permissions.primer.go', message: 'Let’s go' })}
            onPress={step.finish}
            loading={step.leaving}
            testID="primer-go"
          />
          <TextButton
            label={t({ id: 'permissions.primer.later', message: 'Ask me later' })}
            onPress={step.finish}
            align="center"
            testID="primer-later"
          />
        </>
      }
    >
      <Text variant="largeTitle" accessibilityRole="header">
        {t({ id: 'onboarding.premium.permissions.title', message: 'Three things, and why' })}
      </Text>
      <View style={{ gap: theme.space.gap12 }}>
        {KINDS.map((kind) => (
          <AskCard key={kind} kind={kind} />
        ))}
      </View>
      <GuideNote
        name={tokek.name}
        critter={tokek.kind}
        text={t({
          id: 'permissions.primer.guideLine',
          message: 'Say no to any of them. I’ll ask again when it actually matters.',
        })}
      />
    </WizardPage>
  );
}
