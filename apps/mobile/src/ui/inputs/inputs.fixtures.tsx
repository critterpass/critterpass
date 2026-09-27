/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { registerFixture } from '../gallery/registry';
import { Stack } from '../layout/Stack';
import { CodeBoxes } from './CodeBoxes';
import type { CodeStatus } from './CodeBoxes';
import { HoldRing } from './HoldRing';
import type { KeypadKey } from './Keypad';
import { applyKey, Keypad } from './Keypad';
import { KeypadAmount } from './KeypadAmount';
import { LanguageRow } from './LanguageRow';
import { RadioCard } from './RadioCard';
import { RangePrivateMarkers } from './RangePrivateMarkers';
import { SearchField } from './SearchField';
import { Segmented } from './Segmented';
import { SegmentBudget } from './SegmentBudget';
import { SettingsGroup } from './SettingsGroup';
import { SlideToConfirm } from './SlideToConfirm';
import { Slider } from './Slider';
import { TextField } from './TextField';
import type { FieldStatus } from './TextField';
import { Toggle } from './Toggle';

const noop = () => undefined;

function Field({ status, message }: { status: FieldStatus; message?: string }) {
  const [value, setValue] = useState(status === 'idle' ? '' : 'winston@example.com');
  return (
    <TextField
      label="Email"
      value={value}
      onChangeText={setValue}
      status={status}
      {...(message ? { message } : {})}
      placeholder="you@example.com"
    />
  );
}

function Search() {
  const [value, setValue] = useState('ubud');
  return <SearchField value={value} onChangeText={setValue} label="Search places" />;
}

function Code({ groups, status }: { groups?: number[]; status: CodeStatus }) {
  // A gift code is shown as 4d-4 draws it: two groups in, the last one being typed.
  const initial = groups ? 'PASS7K2QMA' : status === 'idle' ? '48' : '482913';
  const [value, setValue] = useState(initial);
  return (
    <CodeBoxes
      label="Verification code"
      value={groups ? value.slice(0, 12) : value.slice(0, 6)}
      onChangeText={setValue}
      status={status}
      {...(groups ? { groups } : {})}
    />
  );
}

function Amount() {
  const [digits, setDigits] = useState('450000');
  const onKey = (key: KeypadKey) => setDigits((current) => applyKey(current, key));
  const value = Number(digits || '0');
  return (
    <Stack gap="16">
      <KeypadAmount
        value={value}
        currency="Rp"
        approx="≈ $28.42 · $4.74 each"
        label={`Rp ${value}`}
      />
      <Keypad onKey={onKey} />
    </Stack>
  );
}

function ToggleDemo() {
  const [on, setOn] = useState(true);
  return (
    <Stack gap="8">
      <Toggle label="Talk out loud" value={on} onValueChange={setOn} />
      <Toggle label="Disabled" value={false} onValueChange={noop} disabled />
    </Stack>
  );
}

function SegmentedDemo() {
  const [value, setValue] = useState<'evenly' | 'share' | 'custom'>('evenly');
  return (
    <Segmented
      label="Split"
      caption="Split"
      value={value}
      onChange={setValue}
      segments={[
        { value: 'evenly', label: 'Evenly' },
        { value: 'share', label: 'By share' },
        { value: 'custom', label: 'Custom', badge: 2 },
      ]}
    />
  );
}

function RadioDemo() {
  const [picked, setPicked] = useState('ryokan');
  return (
    <Stack gap="16">
      <RadioCard
        title="Ryokan in Gion"
        description="2 nights, tatami rooms"
        pickTag="Pon's pick"
        selected={picked === 'ryokan'}
        onSelect={() => setPicked('ryokan')}
      />
      <RadioCard
        title="Apartment near Kyoto Station"
        description="5 nights, 3 bedrooms"
        selected={picked === 'apartment'}
        onSelect={() => setPicked('apartment')}
      />
    </Stack>
  );
}

function SliderDemo() {
  const [music, setMusic] = useState(0.6);
  const [budget, setBudget] = useState(4);
  return (
    <Stack gap="16">
      <Slider label="Music" value={music} onChange={setMusic} />
      <SegmentBudget label="Location pings per day" value={budget} onChange={setBudget} />
    </Stack>
  );
}

function SettingsDemo() {
  const [talk, setTalk] = useState(true);
  return (
    <SettingsGroup
      title="Privacy"
      rows={[
        { key: 'loc', kind: 'value', title: 'Location', value: 'During trips', onPress: noop },
        {
          key: 'mail',
          kind: 'toggle',
          title: 'Find bookings in my email',
          subtitle: 'Read-only, confirmations only',
          value: talk,
          onChange: setTalk,
        },
        { key: 'budget', kind: 'private', title: 'Budget max', subtitle: 'Never shown to anyone' },
        { key: 'offline', kind: 'check', title: 'Bali trip saved offline', checked: true },
        { key: 'leave', kind: 'destructive', title: 'Delete my account', onPress: noop },
      ]}
    />
  );
}

registerFixture('TextField', 'idle', () => <Field status="idle" />);
registerFixture('TextField', 'valid', () => <Field status="valid" message="Looks good" />);
registerFixture('TextField', 'error', () => <Field status="error" message="That email bounced" />);
registerFixture('SearchField', 'with query', () => <Search />);
registerFixture('CodeBoxes', 'typing', () => <Code status="idle" />);
registerFixture('CodeBoxes', 'valid', () => <Code status="valid" />);
registerFixture('CodeBoxes', 'invalid', () => <Code status="invalid" />);
registerFixture('CodeBoxes', 'gift code 4-4-4', () => <Code groups={[4, 4, 4]} status="idle" />);
registerFixture('Keypad', 'amount entry', () => <Amount />);
registerFixture('Toggle', 'on, off, disabled', () => <ToggleDemo />);
registerFixture('Segmented', 'split with badge', () => <SegmentedDemo />);
registerFixture('RadioCard', 'with pick tag', () => <RadioDemo />);
registerFixture('Slider', 'music + ping budget', () => <SliderDemo />);
registerFixture('RangePrivateMarkers', 'budget sweet spot', () => (
  <RangePrivateMarkers
    min={800}
    max={2500}
    markers={[1500, 1600, 1680, 1850, 2000, 2300]}
    sweetSpot={1350}
    minLabel="$800"
    maxLabel="$2,500"
    caption="each dot is someone's max"
    summary="Sweet spot $1,350 each, under all 6 maxes"
  />
));
registerFixture('SlideToConfirm', 'slide to board', () => (
  <SlideToConfirm label="Slide to board" actionLabel="Board" onConfirm={noop} />
));
registerFixture('HoldRing', 'green, gold, pink', () => (
  <Stack gap="16" align="center">
    <HoldRing label="Hold" actionLabel="Befriend" onComplete={noop} />
    <HoldRing label="Hold" actionLabel="Befriend the legend" tone="gold" onComplete={noop} />
    <HoldRing
      label="SOS"
      actionLabel="Send SOS"
      tone="pink"
      confirmMessage="Alert your crew and share your location?"
      onComplete={noop}
    />
  </Stack>
));
registerFixture('SettingsGroup', 'all row kinds', () => <SettingsDemo />);
registerFixture('LanguageRow', 'selected and not', () => (
  <Stack>
    <LanguageRow
      locale="vi"
      nativeName="Tiếng Việt"
      localName="Vietnamese"
      selected
      onSelect={noop}
    />
    <LanguageRow
      locale="ja"
      nativeName="日本語"
      localName="Japanese"
      selected={false}
      onSelect={noop}
    />
  </Stack>
));
