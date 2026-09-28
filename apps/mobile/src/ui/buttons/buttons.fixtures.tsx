/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { IconButton } from './IconButton';
import { InlineAction } from './InlineAction';
import type { PillTone } from './PillButton';
import { PillButton } from './PillButton';
import { SplitCtaRow } from './SplitCtaRow';
import { TextLink } from './TextLink';

const noop = () => undefined;
const TONES: readonly PillTone[] = ['yellow', 'green', 'pink', 'orange', 'ink', 'cream'];

function FlapDemo() {
  const [saved, setSaved] = useState(false);
  return (
    <PillButton label={saved ? 'Saved' : 'Save my pass'} flap onPress={() => setSaved((s) => !s)} />
  );
}

registerFixture('PillButton', 'primary tones', () => (
  <Stack gap="8">
    {TONES.map((tone) => (
      <PillButton key={tone} tone={tone} label={`Add Rp 450k (${tone})`} onPress={noop} />
    ))}
  </Stack>
));
registerFixture('PillButton', 'secondary, tertiary, destructive', () => (
  <Stack gap="8">
    <PillButton variant="secondary" label="Maybe later" onPress={noop} />
    <PillButton variant="tertiary" label="Use a code instead" onPress={noop} />
    <PillButton variant="destructive" label="Leave crew" onPress={noop} />
  </Stack>
));
registerFixture('PillButton', 'sheen', () => (
  <PillButton sheen label="Looks good" onPress={noop} />
));
registerFixture('PillButton', 'label flap', () => <FlapDemo />);
registerFixture('PillButton', 'loading and disabled', () => (
  <Stack gap="8">
    <PillButton loading label="Sending" onPress={noop} />
    <PillButton disabled label="Pick a date first" onPress={noop} />
  </Stack>
));
registerFixture('PillButton', 'small and long label', () => (
  <Stack gap="8">
    <PillButton size="sm" label="Pass+ · Yearly" onPress={noop} />
    <PillButton label="Book the ryokan for all six of us before the price goes up" onPress={noop} />
  </Stack>
));
registerFixture('SplitCtaRow', 'pill + icon', () => (
  <SplitCtaRow
    primary={<PillButton label="Add to plan" onPress={noop} />}
    secondary={<IconButton label="Save" icon="heart" size={58} onPress={noop} />}
  />
));
registerFixture('SplitCtaRow', 'two pills', () => (
  <SplitCtaRow
    secondaryFirst
    primary={<PillButton label="Befriend" tone="green" onPress={noop} />}
    secondary={<PillButton variant="secondary" size="sm" label="Later" onPress={noop} />}
  />
));
registerFixture('InlineAction', 'kinds', () => (
  <Row gap="8" wrap>
    <InlineAction label="I'm in" onPress={noop} />
    <InlineAction label="I'm in" selected onPress={noop} />
    <InlineAction kind="approve" label="Approve" onPress={noop} />
    <InlineAction kind="nudge" label="Nudge" onPress={noop} />
    <InlineAction kind="ghost" label="Skip" onPress={noop} />
  </Row>
));
registerFixture('IconButton', 'surfaces and sizes', () => (
  <Row gap="12" align="center">
    <IconButton label="Done" icon="check" size={40} onPress={noop} />
    <IconButton label="Camera" icon="camera" surface="cream" size={48} onPress={noop} />
    <IconButton label="Share" icon="plane" surface="onPhoto" size={56} onPress={noop} />
    <IconButton label="Wallet" icon="wallet" disabled onPress={noop} />
  </Row>
));
registerFixture('TextLink', 'under a pill', () => (
  <Stack gap="8">
    <PillButton label="Open your pass" onPress={noop} />
    <TextLink label="I have an invite code" onPress={noop} />
    <TextLink label="Ask me later" onPress={noop} disabled />
  </Stack>
));
