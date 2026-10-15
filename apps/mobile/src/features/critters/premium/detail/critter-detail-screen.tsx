/**
 * Critter detail (8.02): the critter's sticker floating over the hero, its name and field note,
 * the facts of my find, the four forms (found ones selectable, locked ones lead to where to meet
 * them) and, for a guide, MAKE IT MY GUIDE (queues `set_guide_skin`, Undo in the toast). A push:
 * clear glass back and share over the hero.
 */
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import {
  Button,
  EmptyState,
  GlassIconButton,
  GlassPill,
  LoadingCritter,
  Tag,
  Text,
  tierWord,
  useToast,
  usePremiumTheme,
} from '@/ui/premium';
import { PageFooter } from '@/ui/premium/shell';

import { artKind } from '../../art-kind';
import { foundAt, unknownName } from '../../critters-copy';
import { useCrewSightings } from '../../data/crew-sightings';
import { useLiveRows, useOwnerUid } from '../../data/live-rows';
import type { EntryRow } from '../../data/queries';
import { detailCopy, skinReverted, skinToast } from '../../detail/detail-copy';
import {
  buildDetail,
  CRITTER_SQL,
  CRITTER_TABLES,
  DETAIL_FORMS_SQL,
  DETAIL_FORMS_TABLES,
  initialForm,
  MY_ENTRIES_SQL,
  MY_ENTRIES_TABLES,
  type CritterDetailRow,
  type DetailForm,
  type DetailFormRow,
} from '../../detail/detail-model';
import { useGuideSkinControl } from '../../detail/guide-skin';
import { PASS_TAB, whereRoute } from '../../routes';
import { FormArt } from '../components/form-art';
import { Float } from '../components/loops';
import { shareCritter } from '../components/share-critter';
import { SCRIM } from '../components/scrims';
import { tierAccent } from '../components/tier';
import { Facts, FormCell, tierGlyph } from './detail-parts';

const HERO = 330;
const STICKER = 210;

export function PremiumCritterDetailScreen() {
  const { critterId: param } = useLocalSearchParams<{ critterId: string }>();
  const critterId = typeof param === 'string' ? param : '';
  const { t } = useLingui();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const toast = useToast();
  const uid = useOwnerUid();
  const critters = useLiveRows<CritterDetailRow>(CRITTER_SQL, [critterId], CRITTER_TABLES);
  const critter = critters.rows[0];
  const forms = useLiveRows<DetailFormRow>(DETAIL_FORMS_SQL, [critterId], DETAIL_FORMS_TABLES);
  const entries = useLiveRows<EntryRow>(
    MY_ENTRIES_SQL,
    uid === null ? null : [uid, critterId],
    MY_ENTRIES_TABLES,
  );
  const crew = useCrewSightings(critterId);
  const skin = useGuideSkinControl(critter?.guide_id ?? null);
  const [picked, setPicked] = useState<string | null>(null);
  const back = () => goBackOr(PASS_TAB);
  const backLabel = t({ id: 'critters.back', message: 'Back' });

  if (critters.loaded && critter === undefined) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.color.ground, paddingTop: insets.top }]}>
        <View style={styles.missingBack}>
          <GlassIconButton icon="back" label={backLabel} onPress={back} />
        </View>
        <EmptyState
          title={t({
            id: 'critters.premium.detail.missingTitle',
            message: 'This critter has wandered',
          })}
          line={t({
            id: 'critters.premium.detail.missingLine',
            message: "It isn't on this phone. Your Critterdex has every one you've met.",
          })}
          check={false}
          action={
            <Button
              label={t({ id: 'critters.premium.backToDex', message: 'Back to the Critterdex' })}
              onPress={back}
            />
          }
          testID="critters-detail-missing"
        />
      </View>
    );
  }
  if (critter === undefined || !forms.loaded || !entries.loaded) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.color.ground }]}>
        <LoadingCritter label={t({ id: 'critters.loading', message: 'Loading the critter' })} />
      </View>
    );
  }

  const model = buildDetail(critter, forms.rows, entries.rows);
  const kind = artKind(model.key);
  const selected =
    model.forms.find((f) => f.id === picked && f.found) ?? initialForm(model) ?? null;
  const copy = detailCopy(model, selected ?? undefined, critter.guide_name, crew);
  const nameOf = (form: DetailForm | null) => form?.name ?? model.name ?? unknownName();
  const name = nameOf(selected);
  const shown = selected?.found === true ? selected : null;
  const accent = shown === null ? theme.color.control : tierAccent(theme, shown.rarity);

  const onSkin = (formId: string | null) => {
    const before = skin.current;
    skin.set(formId);
    const form = model.forms.find((f) => f.id === formId);
    toast.show({
      kind: 'critter',
      message: form === undefined ? skinReverted() : skinToast(nameOf(form)),
      critter: { kind, name },
      undo: () => skin.set(before),
    });
  };
  const onShare = () => {
    if (shown === null) return;
    void shareCritter({
      kind,
      seed: model.seed,
      form: shown.spec,
      name,
      tier: tierWord(shown.rarity),
      city: model.city,
    }).then((ok) => {
      if (!ok) {
        toast.show({
          kind: 'error',
          message: t({
            id: 'critters.premium.shareFailed',
            message: "Couldn't open sharing. Try again?",
          }),
        });
      }
    });
  };
  const wearing = shown !== null && skin.current === shown.id;
  const footed = model.guide !== null && shown !== null;

  return (
    <View style={[styles.fill, { backgroundColor: theme.color.ground }]} testID="critters-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: footed ? 24 : insets.bottom + 24 }}>
        <View
          style={[
            styles.hero,
            {
              height: HERO,
              backgroundColor: accent,
              experimental_backgroundImage: SCRIM.heroTop,
            },
          ]}
        />
        {shown === null ? null : (
          <View style={styles.tierTag}>
            <Tag
              label={`${tierGlyph(shown.rarity)} ${tierWord(shown.rarity)}`}
              color={tierAccent(theme, shown.rarity)}
              rotate={-6}
            />
          </View>
        )}
        <View style={styles.stickerSlot} pointerEvents="none">
          <Float>
            <FormArt
              kind={kind}
              name={name}
              size={STICKER}
              form={shown?.spec ?? null}
              pose="wave"
              seed={model.seed}
            />
          </Float>
        </View>
        <View style={styles.body}>
          <Text variant="display" accessibilityRole="header" numberOfLines={2}>
            {name}
          </Text>
          {copy.fieldNote === null ? null : (
            <Text variant="guide" color={theme.color.status.booked.text} style={styles.note}>
              {copy.fieldNote}
            </Text>
          )}
          <Text variant="captionMuted" tone="muted" style={styles.source}>
            {copy.fieldNoteSource}
          </Text>
          <Facts
            found={shown?.foundAt == null ? null : foundAt(shown.foundAt, locale)}
            where={shown?.place ?? null}
            crew={crew}
          />
          <Text variant="label" tone="muted" style={styles.formsLabel}>
            {t({
              id: 'critters.premium.detail.formsLine',
              message: `One ${model.name ?? critter.set_name ?? ''}, four ways · ${model.foundCount} of ${model.forms.length}`,
            })}
          </Text>
          <View style={styles.grid}>
            {model.forms.map((form) => (
              <FormCell
                key={form.id}
                form={form}
                selected={form.id === shown?.id}
                onPress={() => (form.found ? setPicked(form.id) : router.push(whereRoute(form.id)))}
              />
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={[styles.topRow, { top: insets.top + 6 }]}>
        <GlassIconButton
          icon="back"
          label={backLabel}
          kind="clear"
          onPress={back}
          testID="critters-detail-back"
        />
        <GlassPill label={`#${String(model.no).padStart(3, '0')}`} kind="clear" />
        {shown === null ? (
          <View style={styles.spacer} />
        ) : (
          <GlassIconButton
            icon="share"
            label={copy.share}
            kind="clear"
            onPress={onShare}
            testID="critters-detail-share"
          />
        )}
      </View>
      {model.guide === null || shown === null ? null : (
        // On the page's ground under the scroll, so the forms never run under the button.
        <PageFooter>
          <Button
            label={wearing ? copy.classicLook : copy.makeGuide}
            variant={wearing ? 'secondary' : 'primary'}
            onPress={() => onSkin(wearing ? null : shown.id)}
            testID="critters-detail-skin"
          />
        </PageFooter>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  missingBack: { paddingHorizontal: 20, paddingTop: 6 },
  hero: { borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  tierTag: { position: 'absolute', left: 24, top: 252 },
  stickerSlot: { position: 'absolute', left: 150, top: 176 },
  body: { paddingHorizontal: 24, marginTop: 80 },
  note: { marginTop: 8 },
  source: { marginTop: 6 },
  formsLabel: { marginTop: 22, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  topRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spacer: { width: 44 },
});
