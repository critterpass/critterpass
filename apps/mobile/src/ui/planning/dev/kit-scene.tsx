/**
 * Every planning kit component on one scrolling page (the lab's `kit` scene), in the app's
 * language, for screenshots in English and Vietnamese.
 */
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../../text/Text';
import { makeStyles } from '../../theme';
import { KIT_SAMPLES } from './kit-samples';

const useStyles = makeStyles((t) => ({
  page: { backgroundColor: t.semantic.bg.base },
  content: { paddingHorizontal: t.size.gutter, gap: t.space['24'] },
  sample: { gap: t.space['8'] },
}));

export function PlanningKitScene() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 48 },
      ]}
      testID="planning-kit-scene"
    >
      {KIT_SAMPLES.map((sample) => (
        <View
          key={`${sample.component} ${sample.state}`}
          style={styles.sample}
          testID={`planning-kit-${sample.component.replace(/\s/gu, '-')}`}
        >
          <Text variant="eyebrow">{`${sample.component} · ${sample.state}`}</Text>
          {sample.render()}
        </View>
      ))}
    </ScrollView>
  );
}
