/**
 * Start a crew (3.08) as a page: the glass ✕, "New crew", and "Start the crew" riding the keyboard
 * at the bottom. The crew pass builds itself live above the form: the name types onto it, the
 * sticker slaps on, the cover recolours it. The field focuses on entry; the pass and field stay in
 * view while the pickers scroll under the keyboard. Started, the page becomes the crew's ticket
 * (3.09). A typed name asks before it is thrown away.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, StyleSheet, View, type TextInput } from 'react-native';

import { DEFAULT_CREW_COVER, type CrewCover } from '@cp/domain';

import { Button, GlassIconButton, GuideNote, Text, TextField, usePremiumTheme } from '@/ui/premium';
import { usePresented } from '@/lib/navigation/use-presented';
import {
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useDirtySheetGuard,
  useScreenInsets,
  useScrollEdges,
} from '@/ui/premium/shell';
import { KeyboardAwareScroll, KeyboardStickyFooter } from '@/ui/premium/shell/keyboard/keyboard';

import { useReferralStamps } from '../settings/use-crew-detail';
import { useStartCrew } from '../start-crew/use-start-crew';
import { COVER_FILL, coverOptions } from './crew-look';
import { CrewOn } from './crew-on';
import { CoverPicker, StickerPicker } from './components/pass-pickers';
import { CrewPass } from './components/crew-pass';
import { coverLockedNote, startNote } from './crew-copy';

type StartCrew = ReturnType<typeof useStartCrew<string>>;

export function StartCrewSheet() {
  const start = useStartCrew<string>('tokek');
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

  return <StartCrewForm start={start} cover={cover} />;
}

interface StartCrewFormProps {
  readonly start: StartCrew;
  readonly cover: CrewCover;
}

/** The form; its leave guard goes with it once the crew is started. */
function StartCrewForm({ start, cover }: StartCrewFormProps) {
  const th = usePremiumTheme();
  const stamps = useReferralStamps();
  const [lockedNote, setLockedNote] = useState<string | null>(null);
  const insets = useScreenInsets();
  const footerHeight = th.space.gap8 * 2 + th.size.button + insets.bottom;
  // On iPhone the name takes focus once the sheet has risen, keyboard up as the design shows it.
  // Android leaves it to a tap: focused on open (during the rise or after it), it draws the caret
  // but no keyboard, while the page still lifts its footer and scroll for one.
  const presented = usePresented();
  const nameField = useRef<ComponentRef<typeof TextInput>>(null);
  useEffect(() => {
    if (presented && Platform.OS === 'ios') nameField.current?.focus();
  }, [presented]);
  useDirtySheetGuard(start.name.trim() !== '', {
    title: t({ id: 'crew.premium.start.discardTitle', message: 'Drop this crew?' }),
    message: t({ id: 'crew.premium.start.discardLine', message: 'The name you typed goes.' }),
    discard: t({ id: 'crew.premium.start.discard', message: 'Drop it' }),
    keep: t({ id: 'crew.premium.keepEditing', message: 'Keep editing' }),
  });
  const note = startNote(start.step, start.refusal, start.slow);
  const edges = useScrollEdges();
  return (
    <View style={[styles.root, { backgroundColor: th.color.ground }]} testID="start-crew">
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + th.space.gap6, paddingHorizontal: th.space.gutter },
        ]}
      >
        <GlassIconButton
          icon="close"
          label={t({ id: 'crew.premium.cancel', message: 'Cancel' })}
          onPress={() => router.back()}
          testID="full-screen-close"
        />
        <Text variant="navTitle" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {t({ id: 'crew.premium.start.title', message: 'New crew' })}
        </Text>
        <View style={{ width: th.size.glassNav }} />
      </View>
      {/* The pass and the pickers fade at the header and the footer instead of being cut there. */}
      <View style={styles.root}>
        <KeyboardAwareScroll
          {...edges.scrollProps}
          contentContainerStyle={{ paddingHorizontal: th.space.gutter }}
          // The focused name keeps the footer's button above the keyboard.
          bottomOffset={FOOTER_CLEARANCE + th.size.button + th.space.gap8 * 2}
          contentInsetAdjustmentBehavior="never"
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
              ref={nameField}
              accessibilityLabel={t({ id: 'crew.premium.start.nameLabel', message: 'Crew name' })}
              value={start.name}
              onChangeText={start.setName}
              returnKeyType="done"
              maxLength={start.max}
              counter={`${String(Array.from(start.name).length)}/${String(start.max)}`}
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
        </KeyboardAwareScroll>
        {/* Always on: with the keyboard up the page lifts by its inset, not its offset, and the pass's
          shadow would end in a line at the header. The stage's empty top is under it at rest. */}
        <ScrollEdgeFade edge="top" height={SCROLL_EDGE_FADE} />
      </View>
      <KeyboardStickyFooter
        openedOffset={th.space.gap8}
        style={{
          paddingHorizontal: th.space.titleGutter,
          paddingTop: th.space.gap8,
          paddingBottom: insets.bottom + th.space.gap8,
        }}
      >
        {/* The footer stands on the ground with a fade above it, at rest and riding the keyboard
          alike: the pickers scrolled under it fade out instead of showing round the button. */}
        <ScrollEdgeFade
          edge="bottom"
          height={footerHeight + SCROLL_EDGE_FADE}
          solid={footerHeight}
        />
        <Button
          label={t({ id: 'crew.premium.start.cta', message: 'Start the crew' })}
          disabled={!start.valid || start.busy}
          loading={start.busy}
          onPress={() => void start.create()}
          testID="start-crew-create"
        />
      </KeyboardStickyFooter>
    </View>
  );
}

/** The counter line under the name field and a gap above the footer's button. */
const FOOTER_CLEARANCE = 32;

/** The soft wash behind the pass, in the cover's colour at a quarter strength. */
function coverWash(cover: CrewCover): string {
  return `${COVER_FILL[cover]}44`;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Above the scroll's fade (its band sits at zIndex 1 once Android flattens the plain wrapper
  // around it), so the ✕'s shadow falls over the page uncut.
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, zIndex: 2 },
  title: { flex: 1, textAlign: 'center' },
  stage: { height: 270, alignItems: 'center', justifyContent: 'center' },
  wash: { ...StyleSheet.absoluteFill },
  form: { paddingBottom: 24 },
  section: { marginTop: 8 },
});
