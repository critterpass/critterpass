/* eslint-disable lingui/no-unlocalized-strings -- the dev kit gallery's sample labels, never shipped copy. */
import { useState } from 'react';

import { Checkbox } from '../controls/Checkbox';
import { Chip } from '../controls/Chip';
import { Composer } from '../controls/Composer';
import { ProgressBar, StepProgress } from '../controls/Progress';
import { SegmentedControl } from '../controls/SegmentedControl';
import { Stepper } from '../controls/Stepper';
import { TextField } from '../controls/TextField';
import { Toggle } from '../controls/Toggle';
import { WizardStepper } from '../controls/WizardStepper';
import { Text } from '../text/Text';
import { GalleryRow, GallerySection } from './gallery-section';

type Range = 'day' | 'week' | 'trip';

export function ControlSamples() {
  const [range, setRange] = useState<Range>('week');
  const [on, setOn] = useState(true);
  const [nights, setNights] = useState(3);
  const [checked, setChecked] = useState(true);
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  return (
    <GallerySection title="Controls">
      <SegmentedControl<Range>
        accessibilityLabel="Range"
        value={range}
        onChange={setRange}
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
          { value: 'trip', label: 'Whole trip', weight: 1.4 },
        ]}
      />
      <GalleryRow>
        <Toggle accessibilityLabel="Leave-by alarm" value={on} onChange={setOn} />
        <Toggle accessibilityLabel="Disabled toggle" value={false} onChange={setOn} disabled />
        <Stepper accessibilityLabel="Nights" value={nights} onChange={setNights} min={1} max={14} />
        <Checkbox accessibilityLabel="Packed" checked={checked} onChange={setChecked} />
        <Checkbox accessibilityLabel="Not packed" checked={false} onChange={setChecked} />
      </GalleryRow>
      <GalleryRow>
        <Chip label="All 24" selected={range === 'trip'} onPress={() => setRange('trip')} />
        <Chip label="Food 8" onPress={() => setRange('day')} />
        <Chip label="Saved" surface="white" onPress={() => setRange('week')} />
        <Chip label="Kept" size="small" surface="tint" />
      </GalleryRow>
      <TextField
        accessibilityLabel="Trip name"
        placeholder="Name the trip"
        value={name}
        onChangeText={setName}
      />
      <TextField
        accessibilityLabel="Email"
        value="khanh@"
        error="That email is missing its ending."
        onChangeText={noop}
      />
      <TextField
        accessibilityLabel="Budget"
        value="4,500,000"
        helper="Per person, before flights."
        onChangeText={noop}
      />
      <ProgressBar label="Packing" value={7} total={12} valueLabel="7 of 12" />
      <StepProgress current={2} total={4} />
      <WizardStepper accessibilityLabel="Step 3 of 5" current={3} total={5} />
      <Composer
        accessibilityLabel="Message the crew"
        placeholder="Message the crew"
        value={draft}
        onChangeText={setDraft}
        canSend={draft.trim().length > 0}
        onSend={() => setDraft('')}
        sendLabel="Send"
        add={{ label: 'Add a photo', onPress: noop }}
      />
      <Text variant="captionMuted">Stepper: {String(nights)} nights</Text>
    </GallerySection>
  );
}

function noop(): void {}
