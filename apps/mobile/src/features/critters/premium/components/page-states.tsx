/**
 * A pushed critters page before it has its rows (the guide while they load) or when this phone
 * has no such set or form (an empty state with the way back to the Critterdex). Undesigned; both
 * keep the page's glass back.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { goBackOr } from '@/lib/navigation/back';
import { Button, EmptyState, LoadingCritter } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { PASS_TAB } from '../../routes';

const backLabel = () => t({ id: 'critters.back', message: 'Back' });

export function CrittersPageLoading(props: {
  readonly title: string;
  readonly label: string;
  readonly testID: string;
}) {
  return (
    <PushScreen title={props.title} backLabel={backLabel()} scroll={false} testID={props.testID}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <LoadingCritter label={props.label} />
      </View>
    </PushScreen>
  );
}

export function CrittersPageMissing(props: { readonly title: string; readonly testID: string }) {
  return (
    <PushScreen title={props.title} backLabel={backLabel()} scroll={false} testID={props.testID}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          title={t({ id: 'critters.premium.page.missingTitle', message: 'Not on this phone' })}
          line={t({
            id: 'critters.premium.page.missingLine',
            message: 'It may not have synced yet. Your Critterdex has everything you’ve met.',
          })}
          check={false}
          action={
            <Button
              label={t({ id: 'critters.premium.backToDex', message: 'Back to the Critterdex' })}
              onPress={() => goBackOr(PASS_TAB)}
            />
          }
        />
      </View>
    </PushScreen>
  );
}
