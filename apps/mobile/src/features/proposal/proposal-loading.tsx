/** The proposal screens while their rows arrive: the dark screen with card placeholders. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

const useStyles = makeStyles((th) => ({
  body: { padding: th.space['20'], gap: th.space['16'] },
}));

export function ProposalLoading({ testID = 'proposal-loading' }: { readonly testID?: string }) {
  const styles = useStyles();
  const label = t({ id: 'proposal.loading', message: 'Loading the proposal' });
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID={testID}>
      <View style={styles.body}>
        <Skeleton preset="lines" label={label} />
        <Skeleton preset="card" label={label} />
        <Skeleton preset="card" label={label} />
      </View>
    </Scaffold>
  );
}
