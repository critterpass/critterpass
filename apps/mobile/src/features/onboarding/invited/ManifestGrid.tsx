/**
 * 3a-13's crew manifest: one card per member stamping in by join order (0, 260, 520 … ms), the
 * newcomer's ringed green, then a dashed "not yet" card per named seat still waiting (never who).
 * Up to 16 cards in a wrapping grid that scrolls with the page.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { useStamp } from '@/motion/patterns/stamp';
import { Avatar } from '@/ui/people/Avatar';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

export const STAMP_STEP_MS = 260;

export interface ManifestMember {
  readonly userId: string;
  readonly name: string;
  readonly isNewcomer: boolean;
  readonly isOrganiser: boolean;
}

const useStyles = makeStyles((th) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['12'] },
  card: {
    width: '30%',
    minHeight: 112,
    borderRadius: th.radius.lg,
    backgroundColor: th.color.paper.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: th.space['4'],
    padding: th.space['8'],
  },
  newcomer: { borderWidth: 3, borderColor: th.semantic.state.success },
  pending: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
    backgroundColor: 'transparent',
  },
}));

function MemberCard({
  member,
  index,
  delayMs,
}: {
  member: ManifestMember;
  index: number;
  delayMs: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [go, setGo] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) return undefined;
    const timer = setTimeout(() => setGo(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  const stamp = useStamp({ active: go });
  const tilt = index % 2 === 0 ? -2 : 2;
  const detail = member.isNewcomer
    ? t({ id: 'onboarding.invite.manifest.justNow', message: 'just now' })
    : member.isOrganiser
      ? t({ id: 'onboarding.invite.manifest.organiser', message: 'organiser' })
      : t({ id: 'onboarding.invite.manifest.member', message: 'in' });
  return (
    <Animated.View
      style={[styles.card, member.isNewcomer ? styles.newcomer : null, stamp]}
      testID={`invite-manifest-${member.isNewcomer ? 'newcomer' : `member-${index}`}`}
    >
      {/* The tilted block takes the card's full width, so "just now" is set on one whole line
          instead of being measured at its first word and cut. */}
      <View
        style={{
          transform: [{ rotate: degrees(tilt) }],
          alignItems: 'center',
          alignSelf: 'stretch',
        }}
      >
        <Avatar name={member.name} joinIndex={index} size="md" />
        <Text variant="rowTitle" color={theme.color.paper.ink} numberOfLines={1}>
          {upper(member.name, locale)}
        </Text>
        <Text
          variant="caption"
          color={theme.color.paper.muted}
          numberOfLines={1}
          style={{ textAlign: 'center', alignSelf: 'stretch' }}
        >
          {detail.replaceAll(' ', '\u00a0')}
        </Text>
      </View>
    </Animated.View>
  );
}

function PendingCard({ index }: { index: number }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={[styles.card, styles.pending]} testID={`invite-manifest-pending-${index}`}>
      <Avatar name="?" size="md" pending />
      <Text variant="caption" color={theme.semantic.text.secondary}>
        {t({ id: 'onboarding.invite.manifest.notYet', message: 'not yet' })}
      </Text>
    </View>
  );
}

export function ManifestGrid({
  members,
  waiting,
}: {
  readonly members: readonly ManifestMember[];
  readonly waiting: number;
}) {
  const styles = useStyles();
  return (
    <View style={styles.grid} testID="invite-manifest-grid">
      {members.map((member, index) => (
        <MemberCard
          key={member.userId}
          member={member}
          index={index}
          delayMs={index * STAMP_STEP_MS}
        />
      ))}
      {Array.from({ length: waiting }, (_, index) => (
        <PendingCard key={index} index={index} />
      ))}
    </View>
  );
}
