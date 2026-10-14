/**
 * Edit crew (3.13): a push with the ink Save. The same live pass as starting a crew, wearing the
 * real members' seats; tap it to turn it over (code and members). Name, sticker and cover change
 * the pass as you go; Save sends only what changed and goes back with "Pass updated". Back with
 * changes asks first. Done on the keyboard puts it away; the pass and field stay in view.
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CREW_NAME_MAX, crewNameSchema, normaliseCrewName, type CrewCover } from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import {
  GuideNote,
  PressableScale,
  Text,
  TextField,
  usePremiumTheme,
  useToast,
} from '@/ui/premium';
import { KeyboardAwareScroll, PushScreen, useDirtySheetGuard } from '@/ui/premium/shell';

import { UPDATE_CREW } from '../crews-sheet/crew-commands';
import { useCrewDetail, useReferralStamps } from '../settings/use-crew-detail';
import { coverLockedNote, firstName } from './crew-copy';
import { coverOptions, crewCoverOf, memberAccent } from './crew-look';
import { CrewMissing } from './crew-missing';
import { CrewPass } from './components/crew-pass';
import { CoverPicker, StickerPicker } from './components/pass-pickers';

export function EditCrewScreen() {
  const th = usePremiumTheme();
  const toast = useToast();
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  const detail = useCrewDetail(crewId);
  const stamps = useReferralStamps();
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const [name, setName] = useState<string | null>(null);
  const [art, setArt] = useState<string | null>(null);
  const [cover, setCover] = useState<CrewCover | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [lockedNote, setLockedNote] = useState<string | null>(null);
  const crew = detail.crew;
  const currentName = name ?? crew?.name ?? '';
  const currentArt = art ?? crew?.art ?? 'tokek';
  const currentCover = cover ?? crewCoverOf(crew?.cover);
  const nameChanged = crew !== null && name !== null && normaliseCrewName(name) !== crew.name;
  const artChanged = crew !== null && art !== null && art !== crew.art;
  const coverChanged = crew !== null && cover !== null && cover !== crewCoverOf(crew.cover);
  const dirty = nameChanged || artChanged || coverChanged;
  const valid = crewNameSchema.safeParse(currentName).success;
  const guard = useDirtySheetGuard(dirty, {
    title: t({ id: 'crew.premium.edit.discardTitle', message: 'Discard changes?' }),
    message: t({ id: 'crew.premium.edit.discardLine', message: 'The pass stays as it was.' }),
    discard: t({ id: 'crew.premium.edit.discard', message: 'Discard' }),
    keep: t({ id: 'crew.premium.keepEditing', message: 'Keep editing' }),
  });

  const back = t({ id: 'crew.settings.backPlain', message: 'Back' });
  if (!detail.loaded || crew === null)
    return <CrewMissing loading={!detail.loaded} backLabel={back} />;

  const save = () =>
    void guard.commit(async () => {
      if (commands === null || !dirty || !valid) return;
      await commands.send(UPDATE_CREW, {
        crew_id: crewId,
        ...(nameChanged ? { name: normaliseCrewName(currentName) } : {}),
        ...(artChanged ? { art: currentArt } : {}),
        ...(coverChanged ? { cover: currentCover } : {}),
      });
      toast.show({
        kind: 'done',
        message: t({ id: 'crew.premium.edit.saved', message: 'Pass updated' }),
      });
      guard.leave(() => router.back());
    });

  return (
    <PushScreen
      title={t({ id: 'crew.premium.edit.title', message: 'Edit crew' })}
      backLabel={back}
      scroll={false}
      action={{
        key: 'save',
        label: t({ id: 'crew.premium.edit.save', message: 'Save' }),
        sfSymbol: 'checkmark',
        glyph: 'check',
        primary: true,
        onPress: save,
        testID: 'edit-crew-save',
      }}
      testID="edit-crew"
    >
      <KeyboardAwareScroll
        contentContainerStyle={[styles.content, { paddingHorizontal: th.space.gutter }]}
      >
        <PressableScale
          accessibilityRole="button"
          accessibilityHint={t({
            id: 'crew.premium.edit.flipHint',
            message: 'Turns the pass over',
          })}
          onPress={() => setFlipped((on) => !on)}
          style={styles.stage}
          testID="edit-crew-pass"
        >
          <CrewPass
            name={currentName}
            cover={currentCover}
            art={currentArt}
            seats={detail.members.map((m) => ({
              id: m.user_id,
              name: firstName(m.display_name),
              color: memberAccent(m.colour),
            }))}
            emptySeats={0}
            idle={!dirty}
            back={flipped ? { code: detail.code?.code ?? null } : null}
          />
        </PressableScale>
        <Text variant="label" tone="muted">
          {t({ id: 'crew.premium.start.nameLabel', message: 'Crew name' })}
        </Text>
        <TextField
          accessibilityLabel={t({ id: 'crew.premium.start.nameLabel', message: 'Crew name' })}
          value={currentName}
          onChangeText={(next) => setName(next.slice(0, CREW_NAME_MAX))}
          maxLength={CREW_NAME_MAX}
          returnKeyType="done"
          counter={`${String(Array.from(currentName).length)}/${String(CREW_NAME_MAX)}`}
          testID="edit-crew-name"
        />
        <Text variant="label" tone="muted" style={styles.section}>
          {t({ id: 'crew.premium.start.sticker', message: 'Sticker' })}
        </Text>
        <StickerPicker value={currentArt} onPick={setArt} testID="edit-crew-art" />
        <Text variant="label" tone="muted" style={styles.section}>
          {t({ id: 'crew.premium.start.cover', message: 'Cover' })}
        </Text>
        <CoverPicker
          options={coverOptions(stamps)}
          value={currentCover}
          onPick={(next) => {
            setLockedNote(null);
            setCover(next);
          }}
          onLocked={(locked) => setLockedNote(coverLockedNote(locked))}
          testID="edit-crew-cover"
        />
        <View style={styles.section}>
          <GuideNote
            name="Tokek"
            text={
              lockedNote ??
              t({
                id: 'crew.premium.edit.note',
                message: 'Everyone sees the new pass, and invites you’ve already sent update too.',
              })
            }
          />
        </View>
      </KeyboardAwareScroll>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8, paddingBottom: 40 },
  stage: { height: 270, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 8 },
});
