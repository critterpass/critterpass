/**
 * Start a crew (3.08) as a full-height sheet: Cancel, "New crew", the bold Start. The crew pass
 * builds itself live above the form: the name types onto it, the sticker slaps on, the cover
 * recolours it. The field focuses on entry; Done puts the keyboard away and the pass and field
 * stay in view while the pickers scroll under the keyboard. Started, the sheet becomes the crew's
 * ticket (3.09). A typed name asks before it is thrown away.
 */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DEFAULT_CREW_COVER, type CrewCover } from '@cp/domain';

import { GuideNote, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useReferralStamps } from '../settings/use-crew-detail';
import { useStartCrew } from '../start-crew/use-start-crew';
import { COVER_FILL, coverOptions } from './crew-look';
import { CrewOn } from './crew-on';
import { CoverPicker, StickerPicker } from './components/pass-pickers';
import { CrewPass } from './components/crew-pass';
import { coverLockedNote, startNote } from './crew-copy';

export function StartCrewSheet() {
  const th = usePremiumTheme();
  const start = useStartCrew<string>('tokek');
  const stamps = useReferralStamps();
  const [lockedNote, setLockedNote] = useState<string | null>(null);
  const cover = start.cover ?? DEFAULT_CREW_COVER;

  if (start.step.kind === 'created') {
    return (
      <CrewOn
        crewId={start.step.crewId}
        name={start.name.trim()}
        art={start.art}
        cover={cover}
        code={start.code}
      />
    );
  }

  const note = startNote(start.step, start.refusal, start.slow);
  return (
    <SheetScreen
      title={t({ id: 'crew.premium.start.title', message: 'New crew' })}
      cancelLabel={t({ id: 'crew.premium.cancel', message: 'Cancel' })}
      verb={{
        label: t({ id: 'crew.premium.start.verb', message: 'Start' }),
        disabled: !start.valid || start.busy,
        onPress: async () => {
          await start.create();
          return false;
        },
        testID: 'start-crew-create',
      }}
      dirty={start.name.trim() !== ''}
      discardPrompt={{
        title: t({ id: 'crew.premium.start.discardTitle', message: 'Drop this crew?' }),
        message: t({ id: 'crew.premium.start.discardLine', message: 'The name you typed goes.' }),
        discard: t({ id: 'crew.premium.start.discard', message: 'Drop it' }),
        keep: t({ id: 'crew.premium.keepEditing', message: 'Keep editing' }),
      }}
      testID="start-crew"
    >
      <View style={styles.stage}>
        <View
          pointerEvents="none"
          style={[
            styles.wash,
            {
              // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never copy.
              experimental_backgroundImage: `radial-gradient(circle at 50% 50%, ${coverWash(cover)} 0%, transparent 70%)`,
            },
          ]}
        />
        <CrewPass
          name={
            start.name.trim() === ''
              ? t({ id: 'crew.premium.start.placeholderName', message: 'Your crew' })
              : start.name
          }
          cover={cover}
          art={start.art}
          seats={[]}
          idle={start.name === ''}
          testID="start-crew-pass"
        />
      </View>
      <View style={[styles.form, { gap: th.space.gap8 }]}>
        <Text variant="label" tone="muted">
          {t({ id: 'crew.premium.start.nameLabel', message: 'Crew name' })}
        </Text>
        <TextField
          accessibilityLabel={t({ id: 'crew.premium.start.nameLabel', message: 'Crew name' })}
          value={start.name}
          onChangeText={start.setName}
          autoFocus
          returnKeyType="done"
          maxLength={start.max}
          helper={`${String(Array.from(start.name).length)}/${String(start.max)}`}
          testID="start-crew-name"
        />
        <Text variant="label" tone="muted" style={styles.section}>
          {t({ id: 'crew.premium.start.sticker', message: 'Sticker' })}
        </Text>
        <StickerPicker value={start.art} onPick={start.setArt} testID="start-crew-art" />
        <Text variant="label" tone="muted" style={styles.section}>
          {t({ id: 'crew.premium.start.cover', message: 'Cover' })}
        </Text>
        <CoverPicker
          options={coverOptions(stamps)}
          value={cover}
          onPick={(next) => {
            setLockedNote(null);
            start.setCover(next);
          }}
          onLocked={(locked) => setLockedNote(coverLockedNote(locked))}
          testID="start-crew-cover"
        />
        {lockedNote === null && note === null ? (
          <Text variant="caption" tone="muted" style={styles.section}>
            {t({
              id: 'crew.premium.start.hint',
              message: 'Five seats wait on the pass. Tokek joins with your first trip.',
            })}
          </Text>
        ) : (
          <GuideNote name="Tokek" text={lockedNote ?? note ?? ''} testID="start-crew-note" />
        )}
      </View>
    </SheetScreen>
  );
}

/** The soft wash behind the pass, in the cover's colour at a quarter strength. */
function coverWash(cover: CrewCover): string {
  return `${COVER_FILL[cover]}44`;
}

const styles = StyleSheet.create({
  stage: { height: 270, alignItems: 'center', justifyContent: 'center' },
  wash: { ...StyleSheet.absoluteFillObject },
  form: { paddingBottom: 24 },
  section: { marginTop: 8 },
});
