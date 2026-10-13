/**
 * An Explore page with nothing to show (a place the guide doesn't have, a day trip that isn't
 * one): a pushed page with the kit's empty state and a way back. Undesigned in the premium set;
 * built from the push page and the empty state.
 */
import { View } from 'react-native';

import { Button, EmptyState, usePremiumTheme } from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

export function ExploreMissingPage(props: {
  readonly backLabel: string;
  readonly title: string;
  readonly line: string;
  readonly onBack: () => void;
  readonly testID: string;
  readonly backTestID: string;
}) {
  const theme = usePremiumTheme();
  return (
    <PushScreen title="" backLabel={props.backLabel} testID={props.testID}>
      <View style={{ paddingTop: theme.space.firstControlY - theme.space.statusBar }}>
        <EmptyState
          title={props.title}
          line={props.line}
          check={false}
          action={
            <Button
              label={props.backLabel}
              variant="secondary"
              size="medium"
              onPress={props.onBack}
              testID={props.backTestID}
            />
          }
        />
      </View>
    </PushScreen>
  );
}
