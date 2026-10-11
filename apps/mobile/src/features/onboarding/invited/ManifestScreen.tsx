/**
 * 3a-13 "You're in": the crew manifest with the newcomer's card ringed, confetti, the guide's
 * welcome typing out (the api's line when it comes in time, else the scripted one) and a truthful line about who is still to come (a count, never a name; we
 * never claim a nudge we did not send). A waitlisted joiner reads "you're next for a seat" instead.
 * SEE THE PLAN opens the trip; "Say hi" opens the crew. Members appear as their rows sync; until
 * then the newcomer's own card stands alone.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { deviceTier } from '@/motion/device-tier';
import { triggerConfetti } from '@/motion/patterns/confetti';
import { useTypewriter } from '@/motion/patterns/typewriter';
import { guideSticker } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { GuideLine } from '@/ui/people/GuideLine';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { InviteProblem } from './InviteProblem';
import { ManifestGrid } from './ManifestGrid';
import { useManifest } from './use-manifest';
import { useWelcomeLine } from './use-welcome-line';

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['20'],
    paddingBottom: th.space['24'],
  },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

export function ManifestScreen() {
  // The seat is taken: the page leads on to the plan or the chat, never back into the join.
  useNoBackByDesign();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const manifest = useManifest();
  const { joined, preview, members, copy, openCrew, waiting } = manifest;
  const confettied = useRef(false);
  useEffect(() => {
    if (joined === null || confettied.current) return;
    confettied.current = true;
    triggerConfetti(195, 220, 'medium', deviceTier);
  }, [joined]);
  const welcome = useTypewriter({ text: useWelcomeLine(joined, copy.welcome) });

  if (joined === null) {
    return (
      <Scaffold variant="dark" edges={['top', 'bottom']} testID="invite-manifest-pending">
        <InviteProblem
          kind="offline"
          inviterFirstName={preview?.inviter_first_name ?? null}
          crewName={preview?.crew_name ?? null}
          action={{
            label: t({ id: 'onboarding.invite.manifest.home', message: 'Go home' }),
            onPress: manifest.goHome,
          }}
        />
      </Scaffold>
    );
  }

  const tokek = guideSticker('tokek');
  return (
    <Scaffold variant="paper" edges={['top', 'bottom']} testID="invite-manifest-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Text variant="eyebrow">{upper(copy.eyebrow, locale)}</Text>
          {copy.count === null ? null : <Text variant="eyebrow">{upper(copy.count, locale)}</Text>}
        </View>
        <ManifestGrid members={members} waiting={waiting} />
        <GuideLine
          guide="tokek"
          name={tokek.name}
          bubble
          sticker={<Sticker kind={tokek.kind} name={tokek.name} size={72} />}
          line={welcome.visibleText}
        />
        <Text variant="h1" accessibilityRole="header">
          {upper(copy.title, locale)}
        </Text>
        <Text variant="body" color={theme.color.paper.ink}>
          {copy.body}
        </Text>
      </ScrollView>
      <View style={styles.footer}>
        <PillButton
          label={
            joined.trip_id === null
              ? t({ id: 'onboarding.invite.manifest.openCrew', message: 'Open the crew' })
              : t({ id: 'onboarding.invite.manifest.plan', message: 'See the plan' })
          }
          tone="ink"
          onPress={manifest.openPlan}
          block
          testID="invite-manifest-plan"
        />
        <InlineAction
          label={t({ id: 'onboarding.invite.manifest.sayHi', message: 'Say hi to the crew' })}
          onPress={openCrew}
          testID="invite-manifest-hi"
        />
      </View>
    </Scaffold>
  );
}
