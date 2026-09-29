/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { tokens } from '@cp/design-tokens';

import { View } from 'react-native';

import { registerFixture } from '../gallery/registry';
import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { BackButton } from './BackButton';
import { BackEyebrow } from './BackEyebrow';
import { HeaderPill, HeaderPills } from './HeaderPills';
import { HomeHeader } from './HomeHeader';
import { LargeTitle } from './LargeTitle';

const noop = () => {};
const CREW = [
  { initial: 'M', color: tokens.color.pink },
  { initial: 'A', color: tokens.color.blue },
  { initial: 'J', color: tokens.color.yellow },
];

registerFixture('BackEyebrow', 'default', () => <BackEyebrow label="Profile" onPress={noop} />);
registerFixture('BackEyebrow', 'on a colour surface (3c-1 showdown half)', () => (
  <SurfaceToneProvider value="accent">
    <View style={{ backgroundColor: tokens.color.orange, padding: tokens.space['16'] }}>
      <BackEyebrow label="Next trip · Final" onPress={noop} />
    </View>
  </SurfaceToneProvider>
));

registerFixture('LargeTitle', 'expanded', () => (
  <LargeTitle title="Settings" start={<BackEyebrow label="Profile" onPress={noop} />} />
));

registerFixture('LargeTitle', 'pushed, long title and an action', () => (
  <LargeTitle
    title="Everything your crew needs from you"
    start={<BackButton onPress={noop} />}
    end={<HeaderPill label="Mark all read" onPress={noop} />}
  />
));

registerFixture('HeaderPills', 'all tones', () => (
  <Stack gap="8">
    <HeaderPills>
      <HeaderPill label="Share" onPress={noop} />
      <HeaderPill label="Only you see this" tone="private" />
    </HeaderPills>
    <HeaderPills>
      <HeaderPill label="Live" tone="live" />
      <HeaderPill label="No signal" tone="offline" />
    </HeaderPills>
    <HeaderPills>
      <HeaderPill label="Boosted" tone="boosted" />
      <HeaderPill label="17d 05:26" tone="countdown" />
    </HeaderPills>
  </Stack>
));

registerFixture('HomeHeader', 'unread chat and inbox', () => (
  <HomeHeader
    name="Winston"
    crewName="The Bali Six"
    members={CREW}
    unreadChat={5}
    unreadInbox={3}
    onOpenProfile={noop}
    onSwitchCrew={noop}
    onOpenChat={noop}
    onOpenInbox={noop}
  />
));

registerFixture('HomeHeader', 'all caught up', () => (
  <HomeHeader
    name="Winston"
    crewName="The Bali Six"
    members={CREW}
    onOpenProfile={noop}
    onSwitchCrew={noop}
    onOpenChat={noop}
    onOpenInbox={noop}
  />
));
