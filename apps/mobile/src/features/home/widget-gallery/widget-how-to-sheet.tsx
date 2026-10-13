/**
 * How to add a widget by hand, shown when "+" cannot do it: iOS has no way to add one from an
 * app, and some Android launchers refuse the request.
 */
import { View } from 'react-native';

import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

import { useHowToSteps } from './widget-copy';

export interface WidgetHowToSheetProps {
  /** The widget's name as the gallery shows it. */
  readonly widget: string;
  readonly onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['20'], gap: t.space['10'] },
}));

export function WidgetHowToSheet({ widget, onClose }: WidgetHowToSheetProps) {
  const styles = useStyles();
  const { title, steps } = useHowToSteps(widget);
  return (
    <Sheet
      detents={['fit']}
      title={title}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="widgets-how-to"
    >
      <View style={styles.body}>
        {steps.map((step, index) => (
          <Text key={step} variant="body" testID={`widgets-how-to-step-${index + 1}`}>
            {`${index + 1}. ${step}`}
          </Text>
        ))}
      </View>
    </Sheet>
  );
}
