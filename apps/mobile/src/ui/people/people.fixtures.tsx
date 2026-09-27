/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PillButton } from '../buttons/PillButton';
import { Sticker } from '../sticker/Sticker';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { makeStyles } from '../theme';
import { Avatar } from './Avatar';
import { AvatarStack } from './AvatarStack';
import { CritterAvatar } from './CritterAvatar';
import { EmptySeat } from './EmptySeat';
import { GuideLine } from './GuideLine';
import { LiveSticker } from './LiveSticker';
import { SilhouetteSlot } from './SilhouetteSlot';

const noop = () => undefined;
const CREW = ['Winston', 'Maya', 'Ari', 'Jun', 'Rosa', 'Dani', 'Kofi', 'Lea', 'Tomás', 'Yui'];

const usePaper = makeStyles((t) => ({
  paper: { backgroundColor: t.color.paper.base, borderRadius: t.radius.md },
}));

function Draws() {
  const [round, setRound] = useState(0);
  return (
    <Stack gap="12">
      <Row gap="8" key={round}>
        <LiveSticker kind="gecko" name="Tokek" size={96} />
        <LiveSticker kind="tanuki" name="Pon" size={96} delay={120} />
        <LiveSticker kind="puffin" name="Lundi" size={96} delay={240} />
      </Row>
      <PillButton size="sm" label="Replay all three" onPress={() => setRound((r) => r + 1)} />
    </Stack>
  );
}

function OnPaperGuide() {
  const styles = usePaper();
  return (
    <SurfaceToneProvider value="paper">
      <Stack padding="12" style={styles.paper}>
        <GuideLine guide="pon" name="Pon" line="Temples open at six. Beat the buses." />
      </Stack>
    </SurfaceToneProvider>
  );
}

registerFixture('Avatar', 'initials, sizes, pending', () => (
  <Row gap="8" align="center">
    <Avatar name="Winston" size="sm" />
    <Avatar name="Maya" joinIndex={1} />
    <Avatar name="Ari" joinIndex={2} size="lg" />
    <Avatar name="Jun" joinIndex={3} size="xl" />
    <Avatar name="Rosa" joinIndex={4} size="xl" pending />
  </Row>
));
registerFixture('Avatar', 'members 7–16 ring patterns', () => (
  <Row gap="8" wrap>
    {Array.from({ length: 16 }, (_, index) => (
      <Avatar key={index} name={CREW[index % CREW.length] ?? 'A'} joinIndex={index} size="lg" />
    ))}
  </Row>
));
registerFixture('Avatar', 'critter', () => (
  <Avatar name="Winston" size="xl" critter={<Sticker kind="gecko" name="Tokek" size={40} />} />
));
registerFixture('AvatarStack', 'overflow', () => (
  <AvatarStack members={CREW.map((name, joinIndex) => ({ key: name, name, joinIndex }))} />
));
registerFixture('CritterAvatar', 'tiers', () => (
  <Row gap="12">
    {(['common', 'rare', 'epic', 'legendary'] as const).map((tier) => (
      <CritterAvatar
        key={tier}
        tier={tier}
        name="Tokek"
        sticker={<Sticker kind="gecko" name="Tokek" size={44} />}
      />
    ))}
  </Row>
));
registerFixture('EmptySeat', 'invite', () => (
  <Row gap="8">
    <EmptySeat onPress={noop} />
    <EmptySeat size={64} />
  </Row>
));
registerFixture('GuideLine', 'plain and bubble', () => (
  <Stack gap="12">
    <GuideLine
      guide="tokek"
      name="Tokek"
      line="Blossoms peak around April 3."
      sticker={<Sticker kind="gecko" name="Tokek" size={48} />}
      bubble
    />
    <GuideLine guide="lundi" name="Lundi" line="Pack a shell layer, it turns fast." />
  </Stack>
));
registerFixture('GuideLine', 'on paper', () => <OnPaperGuide />);
registerFixture('SilhouetteSlot', 'grey and gold', () => (
  <Row gap="12">
    <SilhouetteSlot kind="tanuki" city="Kyoto" size={96} />
    <SilhouetteSlot kind="alpaca" city="Cusco" size={96} legendary />
  </Row>
));
registerFixture('LiveSticker', 'three heroes, third waits its turn', () => <Draws />);
