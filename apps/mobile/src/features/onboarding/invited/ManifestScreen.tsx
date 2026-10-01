/**
 * 3a-13 "You're in": the crew manifest with the newcomer's card ringed, confetti, the guide's
 * welcome typing out (the api's line when it comes in time, else the scripted one) and a truthful line about who is still to come (a count, never a name; we
 * never claim a nudge we did not send). A waitlisted joiner reads "you're next for a seat" instead.
 * SEE THE PLAN opens the trip; "Say hi" opens the crew. Members appear as their rows sync; until
 * then the newcomer's own card stands alone.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useAnalytics } from '@/lib/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { deviceTier } from '@/motion/device-tier';
import { triggerConfetti } from '@/motion/patterns/confetti';
import { useTypewriter } from '@/motion/patterns/typewriter';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { GuideLine } from '@/ui/people/GuideLine';
import { useNoBackByDesign } from '@/ui/qa/back-affordance';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { InviteProblem } from './InviteProblem';
import { useInviteServices } from './invite-services';
import { useInviteSession } from './invite-session';
import { ManifestGrid, type ManifestMember } from './ManifestGrid';
import { manifestCopy } from './manifest-copy';
import { watchCrewMembers, type MemberRow } from './manifest-query';
import { HANDOFF_ROUTES, tripPlanRoute } from './routes';
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

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/u)[0] ?? '?';
}

export function ManifestScreen() {
  // The seat is taken: the page leads on to the plan or the chat, never back into the join.
  useNoBackByDesign();
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const analytics = useAnalytics();
  const services = useInviteServices();
  const localFirst = useContext(LocalFirstContext);
  const session = useInviteSession();
  const joined = session.joined;
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<readonly MemberRow[]>([]);
  const reported = useRef(false);

  useEffect(() => {
    void services.uid().then(setUid, () => undefined);
  }, [services]);

  useEffect(() => {
    if (localFirst === null || joined === null) return undefined;
    return watchCrewMembers(localFirst.db, joined.crew_id, setRows);
  }, [localFirst, joined]);

  useEffect(() => {
    if (joined === null || reported.current) return;
    reported.current = true;
    triggerConfetti(195, 220, 'medium', deviceTier);
    const openedAt = session.openedAt;
    if (openedAt !== null) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- an analytics event name.
      analytics.capture('invite_manifest_reached', {
        duration_ms: Math.max(0, services.now() - openedAt),
        waitlisted: joined.waitlisted,
      });
    }
  }, [joined, session.openedAt, analytics, services]);

  const preview = session.preview;
  const myName = firstName(
    preview?.invitee_first_name ?? rows.find((r) => r.user_id === uid)?.display_name ?? null,
  );
  const members: ManifestMember[] = rows.map((row) => ({
    userId: row.user_id,
    name: firstName(row.display_name),
    isNewcomer: row.user_id === uid,
    isOrganiser: row.role === 'organiser',
  }));
  if (uid !== null && !members.some((m) => m.isNewcomer)) {
    members.push({ userId: uid, name: myName, isNewcomer: true, isOrganiser: false });
  }
  const waiting = preview?.invited_waiting ?? 0;
  const copy = manifestCopy({
    name: myName,
    crew: preview?.crew_name ?? '',
    members: members.length,
    cap: preview?.seat_cap ?? null,
    waiting,
    waitlisted: joined?.waitlisted ?? false,
    position: joined?.waitlist_position ?? null,
  });
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
            onPress: () => router.replace(HANDOFF_ROUTES.home),
          }}
        />
      </Scaffold>
    );
  }

  const tokek = GUIDE_STICKERS.tokek;
  const openCrew = () =>
    router.replace({ pathname: HANDOFF_ROUTES.home, params: { crewId: joined.crew_id } });
  return (
    <Scaffold variant="paper" edges={['top', 'bottom']} testID="invite-manifest-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <Text variant="eyebrow">{upper(copy.eyebrow, locale)}</Text>
          {copy.count === null ? null : <Text variant="eyebrow">{upper(copy.count, locale)}</Text>}
        </View>
        <ManifestGrid members={members} waiting={joined.waitlisted ? 0 : waiting} />
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
          onPress={() =>
            joined.trip_id === null ? openCrew() : router.replace(tripPlanRoute(joined.trip_id))
          }
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
