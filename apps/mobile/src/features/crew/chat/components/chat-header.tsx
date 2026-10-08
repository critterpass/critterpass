/**
 * The chat header (3g-1): a plain back arrow, the crew's name on one compact line, "{n} people ·
 * {guide} is in this chat" (the guide part only while the crew has a trip), and the MAP pill with
 * its pin when a map target is registered. Tapping the crew's name opens its settings.
 */
import { plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { createElement } from 'react';
import { View } from 'react-native';

import { Icon } from '@/ui/icons/Icon';
import { PressScale } from '@/ui/press/PressScale';
import { BackButton } from '@/ui/shell/BackButton';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { Row, Stack, Text, useTheme } from '@/ui';
import { makeStyles } from '@/ui/theme';

import { CREW_ROUTES, crewSettingsRoute } from '../../crews-sheet/routes';
import { chatHeaderBadge, chatMapTarget } from '../slots';

export function peopleLine(count: number, guideName: string | null): string {
  const people = t({
    id: 'chat.header.people',
    message: plural(count, { one: '# person', other: '# people' }),
  });
  if (guideName === null) return people;
  return t({ id: 'chat.header.withGuide', message: `${people} · ${guideName} is in this chat` });
}

/** 3g-1 sets the crew name at the foot of the h3 range: a compact one-line header. */
const TITLE_SIZE = 20;

const useStyles = makeStyles((th) => ({
  bar: {
    alignItems: 'center',
    gap: th.space['4'],
    paddingStart: th.space['4'],
    paddingEnd: th.space['12'],
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
  const Badge = chatHeaderBadge();
  const title = crewName ?? t({ id: 'chat.header.fallbackTitle', message: 'Crew chat' });
  return (
    <Row style={styles.bar} testID="chat-header">
      <BackButton fallback={CREW_ROUTES.home} testID="chat-back" />
      <PressScale
        widthClass="wide"
        accessibilityLabel={title}
        accessibilityHint={t({ id: 'chat.header.openSettings', message: 'Opens crew settings' })}
        onPress={() => router.push(crewSettingsRoute(crewId))}
        style={styles.titles}
        testID="chat-crew-settings"
      >
        <Stack gap="2">
          <Text variant="h3" designSize={TITLE_SIZE} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {people > 0 ? (
            <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={1}>
              {peopleLine(people, guideName)}
            </Text>
          ) : null}
        </Stack>
      </PressScale>
      {Badge === null ? null : createElement(Badge, { crewId })}
      {map === null ? null : (
        <View>
          <HeaderPill
            label={t({ id: 'chat.header.map', message: 'Map' })}
            icon={<Icon name="pin" size={theme.space['16']} decorative />}
            onPress={() => map(crewId)}
            testID="chat-map"
          />
        </View>
      )}
    </Row>
  );
}
