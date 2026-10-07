/**
 * How to add a widget by hand, shown when "+" cannot do it: iOS has no way to add one from an
 * app, and some Android launchers refuse the request.
 */
import { useLingui } from '@lingui/react/macro';
import { Platform, View } from 'react-native';

import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

export interface WidgetHowToSheetProps {
  /** The widget's name as the gallery shows it. */
  readonly widget: string;
  readonly onClose: () => void;
}

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['20'], gap: t.space['10'] },
}));

export function WidgetHowToSheet({ widget, onClose }: WidgetHowToSheetProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const title = t({ id: 'home.widgets.howTo.title', message: 'Add it from your home screen' });
  const steps =
    Platform.OS === 'ios'
      ? [
          t({
            id: 'home.widgets.howTo.ios.hold',
            message: 'Touch and hold an empty spot on your home screen.',
          }),
          t({ id: 'home.widgets.howTo.ios.edit', message: 'Tap Edit, then Add Widget.' }),
          t({
            id: 'home.widgets.howTo.ios.pick',
            message: `Search CritterPass and pick ${widget}.`,
          }),
        ]
      : [
          t({
            id: 'home.widgets.howTo.android.hold',
            message: 'Touch and hold an empty spot on your home screen.',
          }),
          t({ id: 'home.widgets.howTo.android.widgets', message: 'Tap Widgets.' }),
          t({
            id: 'home.widgets.howTo.android.pick',
            message: `Find CritterPass and drag ${widget} into place.`,
          }),
        ];
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
