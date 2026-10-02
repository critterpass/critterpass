/** A short list to pick one from (roundup time, crew chat, quiet hours), as a fitted sheet. */
import { View } from 'react-native';

import { RadioCard } from '@/ui/inputs/RadioCard';
import { Sheet } from '@/ui/sheet/Sheet';
import { makeStyles } from '@/ui/theme';

export interface Choice<Key extends string> {
  readonly key: Key;
  readonly title: string;
  readonly description?: string;
}

export interface ChoiceSheetProps<Key extends string> {
  readonly title: string;
  readonly choices: readonly Choice<Key>[];
  readonly selected: Key;
  readonly onSelect: (key: Key) => void;
  readonly onClose: () => void;
  readonly testID: string;
}

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['20'], gap: t.space['10'] },
}));

export function ChoiceSheet<Key extends string>(props: ChoiceSheetProps<Key>) {
  const styles = useStyles();
  return (
    <Sheet
      detents={['fit']}
      title={props.title}
      onDismiss={props.onClose}
      accessibilityLabel={props.title}
      testID={props.testID}
    >
      <View style={styles.body}>
        {props.choices.map((choice) => (
          <RadioCard
            key={choice.key}
            title={choice.title}
            {...(choice.description ? { description: choice.description } : {})}
            selected={choice.key === props.selected}
            onSelect={() => {
              props.onSelect(choice.key);
              props.onClose();
            }}
            testID={`${props.testID}-${choice.key}`}
          />
        ))}
      </View>
    </Sheet>
  );
}
