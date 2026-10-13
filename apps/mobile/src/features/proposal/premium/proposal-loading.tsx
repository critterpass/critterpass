/**
 * A proposal screen before its rows can be drawn, in the premium look (undesigned; a push page
 * with its glass back): the loading critter while reading, and once the wait is over and the
 * proposal still is not on this phone, the empty state with a way back.
 */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import { Button, EmptyState, LoadingCritter } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

export function PremiumProposalLoading(props: {
  readonly missing: boolean;
  readonly fallback: Href | undefined;
  readonly testID: string;
}) {
  const back = t({ id: 'proposal.loadingBack', message: 'Back' });
  return (
    <PushScreen
      title={t({ id: 'proposal.premium.title', message: 'Proposal' })}
      backLabel={back}
      scroll={false}
      testID={props.missing ? 'proposal-missing' : props.testID}
    >
      <View style={styles.centre}>
        {props.missing ? (
          <EmptyState
            title={t({ id: 'proposal.missing.title', message: 'This proposal isn’t here' })}
            line={t({
              id: 'proposal.missing.line',
              message: 'It may have been replaced by a newer one, or this phone hasn’t got it yet.',
            })}
            action={
              <Button
                label={back}
                variant="secondary"
                onPress={() => goBackOr(props.fallback)}
                testID="proposal-missing-back"
              />
            }
          />
        ) : (
          <LoadingCritter label={t({ id: 'proposal.loading', message: 'Loading the proposal' })} />
        )}
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({ centre: { flex: 1, justifyContent: 'center', padding: 24 } });
