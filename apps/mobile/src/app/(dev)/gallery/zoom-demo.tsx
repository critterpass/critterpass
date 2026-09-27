import { Pressable, ScrollView } from 'react-native';

import { useMotionMode } from '@/motion/motion-mode';
import { makeStyles, Scaffold, Stack, Text, useTheme } from '@/ui';
import { useSharedSource, zoomTo } from '@/ui/transitions/use-shared-source';

export const __CP_DEV_ROUTE__ = true;

const CARDS = [
  { id: 'kyoto', title: 'Kyoto', guide: 'pon' },
  { id: 'lisbon', title: 'Lisbon', guide: 'sardi' },
  { id: 'reykjavik', title: 'Reykjavík', guide: 'lundi' },
] as const;

const useStyles = makeStyles((t) => ({
  card: {
    height: 120,
    borderRadius: t.radius.cardBig,
    padding: t.space['16'],
    justifyContent: 'flex-end',
  },
}));

function DemoCard({
  id,
  title,
  color,
}: {
  readonly id: string;
  readonly title: string;
  readonly color: string;
}) {
  const styles = useStyles();
  const [motionMode] = useMotionMode();
  const face = () => (
    <Stack style={[styles.card, { backgroundColor: color }]}>
      <Text variant="h3">{title}</Text>
    </Stack>
  );
  const ref = useSharedSource(id, face);
  return (
    <Pressable
      ref={ref}
      testID={`zoom-card-${id}`}
      accessibilityRole="button"
      onPress={() =>
        void zoomTo(
          id,
          { pathname: '/(dev)/gallery/zoom-detail', params: { id, title } },
          { reduced: motionMode !== 'full' },
        )
      }
    >
      {face()}
    </Pressable>
  );
}

/** Shared-grow demo: tap a card to zoom into its detail; back unzooms into the same card. */
export default function ZoomDemoScreen() {
  const theme = useTheme();
  return (
    <Scaffold testID="zoom-demo">
      <ScrollView contentContainerStyle={{ padding: theme.size.gutter, gap: theme.space['16'] }}>
        <Text variant="h2" accessibilityRole="header">
          Zoom demo
        </Text>
        {CARDS.map((card) => (
          <DemoCard key={card.id} id={card.id} title={card.title} color={theme.guide[card.guide]} />
        ))}
      </ScrollView>
    </Scaffold>
  );
}
