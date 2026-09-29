/**
 * The chat header: a plain back arrow (no circle, as in the render), the crew's name, "{n} people · {guide} is in this chat" (the guide line
 * only while the crew has a trip), and the MAP pill when a map target is registered.
 */
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { I18nManager, Pressable, View } from 'react-native';

import { HeaderPill } from '@/ui/shell/HeaderPills';
import { Row, Stack, Text, useTheme } from '@/ui';
import { degrees, makeStyles, MIN_TOUCH_TARGET } from '@/ui/theme';

import { chatMapTarget } from '../slots';

export function peopleLine(count: number, guideName: string | null): string {
  const people = t({
    id: 'chat.header.people',
    message: plural(count, { one: '# person', other: '# people' }),
  });
  if (guideName === null) return people;
  return t({ id: 'chat.header.withGuide', message: `${people} · ${guideName} is in this chat` });
}

const ARROW_WIDTH = 18;
const ARROW_STROKE = 2;
const ARROW_HEAD = 10;

const useStyles = makeStyles((th) => ({
  bar: {
    alignItems: 'center',
    gap: th.space['4'],
    paddingStart: th.space['4'],
    paddingEnd: th.space['12'],
    paddingVertical: th.space['8'],
  },
  titles: { flex: 1 },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { width: ARROW_WIDTH, height: ARROW_HEAD * 1.5, justifyContent: 'center' },
  shaft: { height: ARROW_STROKE, borderRadius: ARROW_STROKE / 2 },
  head: {
    position: 'absolute',
    start: ARROW_STROKE / 2,
    width: ARROW_HEAD,
    height: ARROW_HEAD,
    borderStartWidth: ARROW_STROKE,
    borderBottomWidth: ARROW_STROKE,
    transform: [{ rotate: degrees(45) }],
  },
}));

/** The render's plain "←": drawn strokes, pointing back in the reading direction. */
function BackArrow({ color }: { readonly color: string }) {
  const styles = useStyles();
  return (
    <View
      style={[styles.arrow, { transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.shaft, { backgroundColor: color }]} />
      <View style={[styles.head, { borderColor: color }]} />
    </View>
  );
}

export function ChatHeader({
  crewId,
  crewName,
  people,
  guideName,
}: {
  readonly crewId: string;
  readonly crewName: string | null;
  readonly people: number;
  readonly guideName: string | null;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const map = chatMapTarget();
  const title = crewName ?? t({ id: 'chat.header.fallbackTitle', message: 'Crew chat' });
  return (
    <Row style={styles.bar} testID="chat-header">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t({ id: 'chat.header.back', message: 'Back' })}
        onPress={() => router.back()}
        hitSlop={theme.space['4']}
        style={styles.back}
        testID="chat-back"
      >
        <BackArrow color={theme.semantic.text.primary} />
      </Pressable>
      <Stack style={styles.titles} gap="2">
        <Text variant="h3" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {people > 0 ? (
          <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={1}>
            {peopleLine(people, guideName)}
          </Text>
        ) : null}
      </Stack>
      {map === null ? null : (
        <View>
          <HeaderPill
            label={t({ id: 'chat.header.map', message: 'Map' })}
            onPress={() => map(crewId)}
            testID="chat-map"
          />
        </View>
      )}
    </Row>
  );
}
