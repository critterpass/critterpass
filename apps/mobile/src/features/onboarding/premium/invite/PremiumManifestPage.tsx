/**
 * 2.19 "You're in": the crew manifest (members by name as their rows sync, the newcomer's row in
 * the warm tint, invited people only as a count), the pink ADMITTED stamp landing with Tokek
 * hopping in, the guide's welcome, and the two ways on: the plan, or saying hi to the crew. ✕
 * goes Home (the seat is taken either way).
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Button,
  CritterSticker,
  ListCard,
  RoundStamp,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

import { guideFacts } from '../../guide-faces';
import { useManifest } from '../../invited/use-manifest';
import { useWelcomeLine } from '../../invited/use-welcome-line';
import { memberAccent } from '../components/member-colour';
import { PICKED_ROW } from '../components/onboarding-colours';
import { StampLanding } from '../components/StampLanding';
import { InviteProblemPage } from './InviteProblemPage';

export function PremiumManifestPage() {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const manifest = useManifest();
  const { joined, preview, members, copy, waiting } = manifest;
  const tokek = guideFacts('tokek');
  const welcome = useWelcomeLine(joined, copy.welcome);

  if (joined === null) {
    return (
      <InviteProblemPage
        kind="offline"
        inviterFirstName={preview?.inviter_first_name ?? null}
        crewName={preview?.crew_name ?? null}
        action={{
          label: t({ id: 'onboarding.invite.manifest.home', message: 'Go home' }),
          onPress: manifest.goHome,
        }}
      />
    );
  }

  const newcomer = members.find((member) => member.isNewcomer)?.name ?? '';
  return (
    <FullScreen
      closeLabel={t({ id: 'common.sheet.close', message: 'Close' })}
      overPhoto={false}
      onClose={manifest.goHome}
      testID="invite-manifest-screen"
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.color.ground }}
        contentContainerStyle={{
          paddingTop: insets.top + 70,
          paddingHorizontal: theme.space.gutter,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap12,
        }}
      >
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}
        >
          <Text variant="mono" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
            {copy.eyebrow}
          </Text>
          {copy.count === null ? null : (
            <Text variant="mono" tone="muted">
              {copy.count}
            </Text>
          )}
        </View>
        <ListCard testID="invite-manifest">
          {members.map((member) => (
            <View
              key={member.userId}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
                paddingVertical: theme.space.rowPadV,
                paddingHorizontal: theme.space.rowPadH,
                backgroundColor:
                  member.isNewcomer && theme.scheme === 'light' ? PICKED_ROW : 'transparent',
              }}
            >
              <Avatar name={member.name} color={memberAccent(theme, member.colour)} size={34} />
              <Text variant="rowTitle" style={{ flex: 1 }}>
                {member.name}
              </Text>
              {member.isOrganiser ? (
                <Text variant="caption" tone="muted">
                  {t({ id: 'onboarding.premium.manifest.organiser', message: 'Organiser' })}
                </Text>
              ) : member.isNewcomer ? (
                <Text variant="caption" tone="muted">
                  {t({ id: 'onboarding.premium.manifest.justNow', message: 'just now' })}
                </Text>
              ) : null}
            </View>
          ))}
          {waiting > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.space.gap12,
                paddingVertical: theme.space.rowPadV,
                paddingHorizontal: theme.space.rowPadH,
                opacity: 0.5,
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  borderWidth: 2,
                  borderStyle: 'dashed',
                  borderColor: theme.color.outlineEmpty,
                }}
              />
              <Text variant="rowTitle" tone="muted">
                {t({
                  id: 'onboarding.premium.manifest.notYet',
                  message: `${waiting} invited, not in yet`,
                })}
              </Text>
            </View>
          ) : null}
        </ListCard>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <CritterSticker kind={tokek.kind} name={tokek.name} size={120} pose="cheer" />
          <StampLanding delayMs={400}>
            <RoundStamp
              word={t({ id: 'onboarding.premium.manifest.in', message: `${newcomer}’s in` })}
              top={t({ id: 'onboarding.premium.manifest.admitted', message: 'Admitted' })}
              {...(preview?.crew_name == null ? {} : { bottom: preview.crew_name })}
              ink="pink"
              size={170}
              rotate={-12}
              testID="invite-manifest-stamp"
            />
          </StampLanding>
        </View>
        <Text variant="guide" color={theme.color.banner.guide.text}>
          {welcome}
        </Text>
        <Text variant="largeTitle" accessibilityRole="header">
          {copy.title}
        </Text>
        <Text variant="rowText" tone="muted">
          {copy.body}
        </Text>
      </ScrollView>
      <View
        style={{
          backgroundColor: theme.color.ground,
          paddingHorizontal: theme.space.titleGutter,
          paddingTop: theme.space.gap8,
          paddingBottom: Math.max(insets.bottom, 16) + 18,
          gap: theme.space.gap8,
        }}
      >
        <Button
          label={
            joined.trip_id === null
              ? t({ id: 'onboarding.invite.manifest.openCrew', message: 'Open the crew' })
              : t({ id: 'onboarding.invite.manifest.plan', message: 'See the plan' })
          }
          onPress={manifest.openPlan}
          testID="invite-manifest-plan"
        />
        <View style={{ alignItems: 'center' }}>
          <TextButton
            label={t({ id: 'onboarding.invite.manifest.sayHi', message: 'Say hi to the crew' })}
            onPress={manifest.openCrew}
            testID="invite-manifest-hi"
          />
        </View>
      </View>
    </FullScreen>
  );
}
