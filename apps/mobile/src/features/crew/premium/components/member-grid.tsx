/**
 * A crew's members as a six-across grid of 42 avatars with first names; the organiser wears an
 * ORG badge. Each opens that member's sheet. "+ Invite" in the header for whoever may invite.
 */
/* eslint-disable lingui/no-unlocalized-strings -- style values, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar, Card, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

import type { CrewMemberRow } from '../../crews-sheet/crew-data';
import { crewMemberRoute } from '../../crews-sheet/routes';
import { firstName } from '../crew-copy';
import { memberAccent } from '../crew-look';

export function MemberGrid({
  crewId,
  members,
  uid,
  canInvite,
  onInvite,
}: {
  readonly crewId: string;
  readonly members: readonly CrewMemberRow[];
  readonly uid: string | null;
  readonly canInvite: boolean;
  readonly onInvite: () => void;
}) {
  const th = usePremiumTheme();
  return (
    <Card style={styles.card} testID="crew-settings-members">
      <View style={styles.header}>
        <Text variant="label" tone="muted">
          {t({ id: 'crew.premium.members', message: `Members · ${members.length}` })}
        </Text>
        {canInvite ? (
          <PressableScale
            accessibilityRole="button"
            onPress={onInvite}
            testID="crew-settings-invite"
          >
            <Text variant="bannerAction" color={th.color.status.rain.text}>
              {t({ id: 'crew.premium.plusInvite', message: '+ Invite' })}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      <View style={styles.grid}>
        {members.map((member) => {
          const name =
            member.user_id === uid
              ? t({ id: 'crew.members.you', message: 'You' })
              : firstName(member.display_name);
          return (
            <PressableScale
              key={member.user_id}
              accessibilityRole="button"
              accessibilityLabel={name}
              onPress={() => router.push(crewMemberRoute(crewId, member.user_id))}
              style={styles.cell}
              testID={`crew-member-${member.user_id}`}
            >
              <View>
                <Avatar
                  name={firstName(member.display_name)}
                  color={memberAccent(member.colour)}
                  size={42}
                />
                {member.role === 'organiser' ? (
                  <View
                    style={[
                      styles.org,
                      { backgroundColor: th.color.ink, borderColor: th.color.card },
                    ]}
                  >
                    <Text variant="stampSmall" color={th.color.onInk}>
                      {t({ id: 'crew.premium.org', message: 'ORG' })}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text variant="badge" tone="inkSecondary" numberOfLines={1}>
                {name}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 12, paddingHorizontal: 8, paddingBottom: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  cell: { width: '16.66%', alignItems: 'center', gap: 4 },
  org: {
    position: 'absolute',
    right: -4,
    bottom: -3,
    borderRadius: 6,
    borderWidth: 2,
    paddingHorizontal: 3,
  },
});
