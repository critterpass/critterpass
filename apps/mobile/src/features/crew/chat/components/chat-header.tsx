/**
 * The chat header: back, the crew's name, "{n} people · {guide} is in this chat" (the guide line
 * only while the crew has a trip), and the MAP pill when a map target is registered.
 */
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { I18nManager, View } from 'react-native';

import { IconButton } from '@/ui/buttons/IconButton';
import { Icon } from '@/ui/icons/Icon';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { chatMapTarget } from '../slots';

export function peopleLine(count: number, guideName: string | null): string {
  const people = t({
    id: 'chat.header.people',
    message: plural(count, { one: '# person', other: '# people' }),
  });
  if (guideName === null) return people;
  return t({ id: 'chat.header.withGuide', message: `${people} · ${guideName} is in this chat` });
}

const useStyles = makeStyles((th) => ({
  bar: {
    alignItems: 'center',
    gap: th.space['8'],
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['8'],
  },
  titles: { flex: 1 },
}));

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
      <IconButton
        label={t({ id: 'chat.header.back', message: 'Back' })}
        glyph={
          <Icon
            name="arrow"
            size={theme.space['20']}
            decorative
            color={theme.semantic.text.primary}
            style={{ transform: [{ scaleX: I18nManager.isRTL ? 1 : -1 }] }}
          />
        }
        onPress={() => router.back()}
        testID="chat-back"
      />
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
