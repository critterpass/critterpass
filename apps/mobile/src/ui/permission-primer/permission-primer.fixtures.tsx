/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { registerFixture } from '../gallery/registry';
import { BackgroundLocationDisclosure } from './BackgroundLocationDisclosure';
import { exactAlarmOffLine, primerCopy, statusLine } from './copy';
import { DeniedRow } from './DeniedRow';
import { CalendarFitDemo, CameraDemo, CritterPingDemo, LeaveByDemo, MicDemo } from './demos';
import { PermissionsSection } from './PermissionsSection';
import { PrimerCard } from './PrimerCard';

const noop = () => undefined;

function ToggleableCard({ kind }: { readonly kind: 'notifications' | 'location' | 'calendar' }) {
  const [on, setOn] = useState(false);
  const copy = primerCopy(kind);
  const demo =
    kind === 'notifications' ? (
      <LeaveByDemo />
    ) : kind === 'location' ? (
      <CritterPingDemo />
    ) : (
      <CalendarFitDemo />
    );
  return (
    <PrimerCard title={copy.title} body={copy.body} demo={demo} value={on} onValueChange={setOn} />
  );
}

registerFixture('PrimerCard', 'alarms and pings (off)', () => (
  <ToggleableCard kind="notifications" />
));
registerFixture('PrimerCard', 'location, on trips (off)', () => <ToggleableCard kind="location" />);
registerFixture('PrimerCard', 'calendar (off)', () => <ToggleableCard kind="calendar" />);
registerFixture('PrimerCard', 'location refused (snapped back)', () => {
  const copy = primerCopy('location');
  return (
    <PrimerCard
      title={copy.title}
      body={copy.body}
      demo={<CritterPingDemo />}
      value={false}
      onValueChange={noop}
      footer={<DeniedRow line={statusLine('denied')} onOpenSettings={noop} />}
    />
  );
});
registerFixture('PrimerDemo', 'camera', () => <CameraDemo />);
registerFixture('PrimerDemo', 'microphone', () => <MicDemo />);
registerFixture('DeniedRow', 'approximate location', () => (
  <DeniedRow
    line={statusLine('granted', { approximate: true })}
    actionLabel="Allow precise"
    onOpenSettings={noop}
  />
));
registerFixture('DeniedRow', 'while using only', () => (
  <DeniedRow
    line={statusLine('granted', { wiuOnly: true })}
    actionLabel="Allow all the time"
    onOpenSettings={noop}
  />
));
registerFixture('DeniedRow', 'quiet notifications', () => (
  <DeniedRow line={statusLine('provisional')} actionLabel="Turn on alerts" onOpenSettings={noop} />
));
registerFixture('DeniedRow', 'exact alarms off', () => (
  <DeniedRow line={exactAlarmOffLine()} onOpenSettings={noop} />
));
registerFixture('PermissionsSection', 'live status', () => <PermissionsSection />);
registerFixture('BackgroundLocationDisclosure', 'android always upgrade', () => (
  <BackgroundLocationDisclosure onContinue={noop} onDecline={noop} />
));
