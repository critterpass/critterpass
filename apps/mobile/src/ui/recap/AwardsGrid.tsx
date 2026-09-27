import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { SLAP_STAGGER_MS, useSlap } from '@/motion/patterns/slap';

import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface Award {
  readonly id: string;
  /** "Earliest riser". */
  readonly title: string;
  /** "Up at 02:51 on Batur day. Nobody asked." */
  readonly line: string;
  readonly personName: string;
  readonly avatar?: ReactNode;
  readonly color: string;
  /** Crew-voted MVP: gold edge. */
  readonly mvp?: boolean;
}

export interface AwardsGridProps {
  readonly awards: readonly Award[];
  /** Opens the one-tap MVP vote. */
  readonly onVoteMvp?: () => void;
  readonly voteLabel?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: th.space['10'],
  },
  card: { width: '48%', borderRadius: th.radius.lg, padding: th.space['12'], gap: th.space['6'] },
}));

function AwardCard({ award, index }: { readonly award: Award; readonly index: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const slap = useSlap({
    active: true,
    direction: index % 2 === 0 ? 1 : -1,
    delayMs: index * SLAP_STAGGER_MS,
  });
  const mvp = award.mvp ? t({ id: 'common.recap.mvp', message: 'MVP' }) : undefined;
  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: award.color },
        award.mvp
          ? {
              borderWidth: theme.tier.legendary.edge?.widthPt ?? theme.space['2'],
              borderColor: theme.color.gold.base,
            }
          : null,
        slap,
      ]}
    >
      <Stack
        gap="6"
        accessible
        accessibilityRole="text"
        accessibilityLabel={[award.title, award.personName, award.line, mvp]
          .filter(Boolean)
          .join(', ')}
      >
        <SurfaceToneProvider value="accent">
          {award.avatar}
          <Text variant="title">{award.title}</Text>
          <Text variant="bodySm">{award.line}</Text>
        </SurfaceToneProvider>
      </Stack>
    </Animated.View>
  );
}

/** Six crew awards dealt at slightly wrong angles, with the MVP vote under them. */
export function AwardsGrid({ awards, onVoteMvp, voteLabel, testID }: AwardsGridProps) {
  const styles = useStyles();
  return (
    <Stack gap="16" testID={testID}>
      <View style={styles.grid}>
        {awards.map((award, index) => (
          <AwardCard key={award.id} award={award} index={index} />
        ))}
      </View>
      {onVoteMvp ? (
        <ActionPill
          tone="primary"
          label={voteLabel ?? t({ id: 'common.recap.voteMvp', message: 'Vote for the MVP' })}
          onPress={onVoteMvp}
        />
      ) : null}
    </Stack>
  );
}
