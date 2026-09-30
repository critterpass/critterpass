import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { PROPOSAL_LAB_SCENE_NAMES } from '@/features/proposal/dev/lab-scenes';
import { makeStyles, Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The proposal screens (3f-1 … 3f-6) as scenes with fixed data, for review and screenshots. */
export default function ProposalLab() {
  const styles = useStyles();
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack gap="8">
        <Text variant="h2" testID="proposal-lab">
          Proposal lab
        </Text>
        {PROPOSAL_LAB_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/proposal-scene', params: { scene: name } })
            }
            testID={`proposal-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, paddingTop: t.space['32'] * 2 },
}));
