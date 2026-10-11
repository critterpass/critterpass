/**
 * The pass (9.01) as the Pass tab's root: the passport page, stamps, how you travel, crews, the
 * Critterdex and inviting friends; Edit and Settings are the header's two glass actions.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { MONETIZE_ROUTES } from '@/features/monetize';
import { Text, usePremiumTheme } from '@/ui/premium';
import { RootScreen } from '@/ui/premium/shell';

import { useMemberFaces } from '../../avatar/member-faces';
import { useOwnerUid } from '../../data/live-rows';
import { RetakeSheet } from '../../profile/retake-sheet';
import { useProfile } from '../../profile/use-profile';
import { crewHref, NEW_CREW_ROUTE, YOU_ROUTES } from '../../routes';
import { PassportCard } from './passport-card';
import { ProfileSections } from './profile-sections';

/* eslint-disable lingui/no-unlocalized-strings -- routes and SF Symbol names, never copy. */
const CRITTERDEX_ROUTE = '/you/critterdex';
const INVITE_FRIENDS_ROUTE = '/crew/invite-friends';
/* eslint-enable lingui/no-unlocalized-strings */

export function ProfilePremiumScreen() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { model } = useProfile();
  const uid = useOwnerUid();
  const faces = useMemberFaces();
  const photoUri = uid === null ? null : (faces.faceProps(uid, 'xl').photo?.uri ?? null);
  const [retaking, setRetaking] = useState(false);

  return (
    <>
      <RootScreen
        title={t({ id: 'you.profile.backPass', message: 'Pass' })}
        testID="you-profile"
        actions={[
          {
            key: 'edit',
            label: t({ id: 'you.profile.edit', message: 'Edit' }),
            sfSymbol: 'pencil',
            glyph: 'edit',
            onPress: () => router.push(YOU_ROUTES.edit),
            testID: 'you-profile-edit',
          },
          {
            key: 'settings',
            label: t({ id: 'you.profile.settings', message: 'Settings' }),
            sfSymbol: 'gearshape',
            glyph: 'more',
            onPress: () => router.push(YOU_ROUTES.settings),
            testID: 'you-profile-settings',
          },
        ]}
      >
        {({ scrollProps, largeTitle }) => (
          <ScrollView
            {...scrollProps}
            contentContainerStyle={{ paddingBottom: th.space.tabBarClearance }}
          >
            {largeTitle}
            {model === null ? (
              <View
                style={{ height: 220, marginHorizontal: th.space.gutter, borderRadius: 28 }}
                testID="you-profile-loading"
              >
                <View
                  style={{ flex: 1, borderRadius: 28, backgroundColor: th.color.skeletonFrom }}
                />
                <Text variant="label" tone="muted" style={{ marginTop: th.space.gap12 }}>
                  {t({ id: 'you.premium.loading', message: 'Opening your pass…' })}
                </Text>
              </View>
            ) : (
              <>
                <View style={{ height: th.space.gap8 }} />
                <PassportCard
                  model={model}
                  photoUri={photoUri}
                  onPassPlus={() => router.push(MONETIZE_ROUTES.plan)}
                />
                <ProfileSections
                  model={model}
                  onAllStamps={() => router.push(YOU_ROUTES.stamps)}
                  onRetake={() => setRetaking(true)}
                  onOpenCrew={(crewId) => router.push(crewHref(crewId))}
                  onStartCrew={() => router.push(NEW_CREW_ROUTE)}
                  onCritterdex={() => router.push(CRITTERDEX_ROUTE)}
                  onInviteFriends={() => router.push(INVITE_FRIENDS_ROUTE)}
                />
              </>
            )}
          </ScrollView>
        )}
      </RootScreen>
      {retaking ? <RetakeSheet onClose={() => setRetaking(false)} /> : null}
    </>
  );
}
