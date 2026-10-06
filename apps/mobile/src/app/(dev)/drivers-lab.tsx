import { useEffect, useState } from 'react';
import { BackHandler, ScrollView } from 'react-native';

import { DetailView } from '@/features/drivers/directory/DetailView';
import { DirectoryView } from '@/features/drivers/directory/DirectoryView';
import { NO_FILTERS } from '@/features/drivers/directory/filter';
import { InviteView } from '@/features/drivers/invite/InviteView';
import { LAB_DETAIL, LAB_DIRECTORY, LAB_OURS } from '@/features/drivers/ours/dev/lab-fixtures';
import { OurDriversView } from '@/features/drivers/ours/OurDriversView';
import { RateDriverView } from '@/features/drivers/rating/RateDriverView';
import { driverInviteMessage, type DriverTag, type DriverVerdict } from '@cp/domain';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const SCENES = [
  ['directory', '6e-1 Crews’ drivers'],
  ['detail', '6e-2 Driver detail'],
  ['empty', '6e-3 Nobody listed here'],
  ['rate', '6g-1 Rate your driver'],
  ['invite', '6g-2 Invite Made'],
  ['ours', '6g-3 Waiting for Made'],
] as const;
type Scene = (typeof SCENES)[number][0];

const noop = () => undefined;

function RateScene() {
  const [verdict, setVerdict] = useState<DriverVerdict | null>('loved');
  const [tags, setTags] = useState<readonly DriverTag[]>([
    'on_time',
    'safe_driver',
    'knew_the_spots',
  ]);
  const [tip, setTip] = useState(
    'Ask for the upper car park at Jatiluwih. Much less walking back.',
  );
  return (
    <RateDriverView
      name="Made"
      days={[3, 7]}
      detail="Avanza · Jatiluwih and Uluwatu · Rp 1.4M"
      verdict={verdict}
      tags={tags}
      tip={tip}
      saving={false}
      saved={false}
      onBack={noop}
      onVerdict={setVerdict}
      onToggleTag={(tag) =>
        setTags((all) => (all.includes(tag) ? all.filter((x) => x !== tag) : [...all, tag]))
      }
      onTip={setTip}
      onSave={noop}
      onInvite={noop}
    />
  );
}

function InviteScene() {
  const [bahasa, setBahasa] = useState(false);
  const message = driverInviteMessage(
    {
      driverName: 'Made',
      senderName: 'Winston',
      crewSize: 6,
      places: 'Jatiluwih and Uluwatu',
      dates: '14 and 18 Oct',
      url: 'critterpass.app/d/made-7k2q',
    },
    bahasa,
  );
  return (
    <InviteView
      name="Made"
      message={message}
      withBahasa={bahasa}
      expiresOn="20 Nov"
      error={null}
      onBack={noop}
      onMessage={noop}
      onBahasa={setBahasa}
      onOpenWhatsApp={noop}
    />
  );
}

function SceneView({ scene }: { readonly scene: Scene }) {
  const filters = { ...NO_FILTERS, areas: ['Ubud'] };
  switch (scene) {
    case 'directory':
    case 'empty':
      return (
        <DirectoryView
          drivers={scene === 'empty' ? [] : LAB_DIRECTORY}
          areaChips={scene === 'empty' ? ['Amed'] : ['Ubud']}
          languageChip="English"
          filters={scene === 'empty' ? { ...NO_FILTERS, areas: ['Amed'] } : filters}
          onToggleArea={noop}
          onToggleLanguage={noop}
          onToggleSevenPlus={noop}
          onToggleDayTrips={noop}
          widenTo={scene === 'empty' ? 'Sidemen' : null}
          onWiden={noop}
          staleLine={null}
          loading={false}
          onBack={noop}
          onOpen={noop}
        />
      );
    case 'detail':
      return (
        <DetailView
          driver={LAB_DETAIL}
          shortlisting={false}
          shortlisted={false}
          onBack={noop}
          onMessage={noop}
          onShortlist={noop}
          onReport={noop}
          onReportTip={noop}
        />
      );
    case 'rate':
      return <RateScene />;
    case 'invite':
      return <InviteScene />;
    case 'ours':
      return (
        <OurDriversView
          drivers={LAB_OURS}
          crewSize={6}
          now={new Date('2026-10-25T09:00:00Z')}
          busy={null}
          onBack={noop}
          onRate={noop}
          onInvite={noop}
          onNudge={noop}
          onCancel={noop}
          onDirectory={noop}
        />
      );
  }
}

/** Every designed drivers screen as a scene, with the renders' data. */
export default function DriversLab() {
  const [scene, setScene] = useState<Scene | null>(null);
  // Android back leaves the scene for the list, not the lab.
  useEffect(() => {
    if (scene === null) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setScene(null);
      return true;
    });
    return () => sub.remove();
  }, [scene]);
  if (scene !== null) return <SceneView scene={scene} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Crews’ drivers lab</Text>
        {SCENES.map(([id, label]) => (
          <ListCard
            key={id}
            title={label}
            chevron
            onPress={() => setScene(id)}
            testID={`drivers-lab-${id}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
