import type { PermissionKind } from '@/lib/permissions';
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { feedback } from '@/motion/feedback';
import {
  isSatisfied,
  openPermissionSettings,
  requestWithPrimer,
  usePermission,
} from '@/lib/permissions';

import { InlineAction } from '../buttons/InlineAction';
import { PillButton } from '../buttons/PillButton';
import { GUIDE_STICKERS } from '../avatar/guides';
import { type GuideId, GuideLine } from '../people/GuideLine';
import { BackEyebrow } from '../shell/BackEyebrow';
import { Sticker } from '../sticker/Sticker';
import { Scaffold } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { useTheme } from '../theme';
import { primerCopy, statusLine } from './copy';
import { DeniedRow } from './DeniedRow';
import { demoFor } from './demos';
import { PrimerCard } from './PrimerCard';

/** The three 3a-9 cards, in render order. */
export const ONBOARDING_PRIMER_KINDS = ['notifications', 'location', 'calendar'] as const;

function PrimerToggleCard({ kind }: { readonly kind: PermissionKind }) {
  const { report } = usePermission(kind);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const copy = primerCopy(kind);
  const on = report !== undefined && isSatisfied(kind, report);

  const onValueChange = async (next: boolean) => {
    feedback.emit('snap');
    if (!next) {
      // An OS grant cannot be taken back from inside the app; Settings is where it is turned off.
      await openPermissionSettings(kind);
      return;
    }
    setBusy(true);
    try {
      const outcome = await requestWithPrimer(kind, 'onboarding', { primed: true });
      setRefused(outcome.result === 'denied' || outcome.result === 'settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PrimerCard
      title={copy.title}
      body={copy.body}
      demo={demoFor(kind)}
      value={on}
      busy={busy}
      onValueChange={(next) => void onValueChange(next)}
      testID={`primer-${kind}`}
      footer={
        refused && !on ? (
          <DeniedRow
            line={statusLine('denied')}
            onOpenSettings={() => void openPermissionSettings(kind)}
            testID={`primer-${kind}-denied`}
          />
        ) : null
      }
    />
  );
}

export interface PermissionsPrimerProps {
  readonly guide: GuideId;
  readonly guideName: string;
  /** "LET'S GO": continue with whatever the user turned on. */
  readonly onDone: () => void;
  /** "Ask me later": nothing is asked now; each feature asks at its own moment. */
  readonly onLater: () => void;
  readonly onBack?: () => void;
}

/**
 * 3a-9 "Three things, and why": alarms and pings, location on trips, calendar. Every toggle
 * starts off; nothing is asked until one is flipped on, and "Ask me later" really asks later.
 */
export function PermissionsPrimer({
  guide,
  guideName,
  onDone,
  onLater,
  onBack,
}: PermissionsPrimerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Scaffold
      variant="dark"
      edges={[]}
      style={{ paddingBottom: insets.bottom + 12 }}
      testID="permissions-primer"
    >
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <BackEyebrow
            label={t({ id: 'permissions.primer.back', message: 'Your pass' })}
            {...(onBack ? { onPress: onBack } : {})}
          />
          <Text variant="eyebrow" color={theme.color.yellow}>
            {t({ id: 'permissions.primer.lastStep', message: 'Last step' })}
          </Text>
        </View>
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'permissions.primer.title', message: 'Three things, and why' })}
        </Text>
        {ONBOARDING_PRIMER_KINDS.map((kind) => (
          <PrimerToggleCard key={kind} kind={kind} />
        ))}
        <GuideLine
          guide={guide}
          name={guideName}
          sticker={<Sticker kind={GUIDE_STICKERS[guide].kind} name={guideName} size={44} />}
          line={t({
            id: 'permissions.primer.guideLine',
            message: 'Say no to any of them. I’ll ask again when it actually matters.',
          })}
        />
      </ScrollView>
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'permissions.primer.go', message: 'Let’s go' })}
          onPress={onDone}
          block
          testID="permissions-primer-go"
        />
        <InlineAction
          label={t({ id: 'permissions.primer.later', message: 'Ask me later' })}
          onPress={onLater}
          testID="permissions-primer-later"
        />
      </View>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 14, paddingBottom: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { paddingHorizontal: 20, gap: 12, alignItems: 'center' },
});
