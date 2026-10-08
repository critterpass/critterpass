/**
 * Critter detail (3l-3) from props: the card flips in from the pass; tapping a found form spins
 * the sticker and recolours the card (rare recolours, epic adds its pose and pink edge, legendary
 * goes gold); locked forms shake and say what it takes. MAKE IT MY GUIDE (a guide's own critter
 * only) and share sit at the bottom. Under Reduce Motion the flip and spin are cross-fades.
 */
import { upper } from '@cp/i18n';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton, type PillTone } from '@/ui/buttons/PillButton';
import type { CardTone } from '@/ui/cards/tone';
import { CritterDetail } from '@/ui/critters/CritterDetail';
import { FormSelector } from '@/ui/critters/FormSelector';
import { tierWord, type Tier } from '@/ui/critters/tier';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { Row } from '@/ui/layout/Row';
import { Avatar } from '@/ui/people/Avatar';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { degrees, makeStyles, useTheme } from '@/ui/theme';
import { tokens } from '@cp/design-tokens';

import { artKind } from '../art-kind';
import { backLabel, foundAt, unknownName } from '../critters-copy';
import { PASS_TAB } from '../routes';
import { detailCopy } from './detail-copy';
import { initialForm, type DetailForm, type DetailModel } from './detail-model';

const HERO_ART = 200;
const FORM_ART = 40;
const TONE_PILL = {
  common: 'cream',
  rare: 'green',
  epic: 'pink',
  legendary: 'yellow',
} as const;
const TONE: Readonly<Record<Tier, CardTone>> = {
  common: 'cream',
  rare: 'green',
  epic: 'pink',
  legendary: 'yellow',
};

const PILL: Readonly<Record<Tier, PillTone>> = TONE_PILL;

export interface DetailViewProps {
  readonly model: DetailModel;
  readonly me: string;
  readonly crew: readonly string[];
  readonly guideName: string | null;
  /** The form the guide wears now (null: its canonical look). */
  readonly skinFormId: string | null;
  readonly onSkin: (formId: string | null) => void;
  readonly onShare: (form: DetailForm) => void;
  /** Where to find a form not found yet (its places, window and steps). */
  readonly onWhere?: (formId: string) => void;
}

const useStyles = makeStyles((th) => ({
  body: { paddingHorizontal: th.size.gutter, gap: th.space['14'] },
  footer: {
    flexDirection: 'row',
    gap: th.space['10'],
    alignItems: 'center',
    paddingHorizontal: th.size.gutter,
    paddingVertical: th.space['12'],
  },
}));

export function DetailView(props: DetailViewProps) {
  const { model } = props;
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const reduced = useReducedImpactMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const form = model.forms.find((f) => f.id === selectedId) ?? initialForm(model);
  const flip = useSharedValue(reduced ? 0 : 90);
  const spin = useSharedValue(0);
  useEffect(() => {
    flip.value = withTiming(0, { duration: theme.motion.duration.base });
  }, [flip, theme.motion.duration.base]);
  const flipStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : 1 - flip.value / 90,
    transform: [{ perspective: 800 }, { rotateY: `${flip.value}deg` }],
  }));
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const copy = detailCopy(model, form, props.guideName, props.crew);
  const name = form?.name ?? model.name ?? unknownName();

  const select = (tier: Tier) => {
    const next = model.forms.find((f) => f.rarity === tier && f.found);
    if (next === undefined || next.id === form?.id) return;
    impact('slap');
    if (!reduced) {
      spin.value = 0;
      spin.value = withTiming(360, { duration: theme.motion.duration.base });
    }
    setSelectedId(next.id);
  };

  const isSkin = form !== undefined && props.skinFormId === form.id;
  // Locked forms only shake when tapped: where to find the next one sits under the picker.
  const nextUnfound = model.forms.find((f) => !f.found);
  const owners = [props.me, ...props.crew].filter(Boolean).slice(0, 3);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="critters-detail">
      <ScrollView contentContainerStyle={{ paddingTop: theme.space['8'] }} style={{ flex: 1 }}>
        <View style={styles.body}>
          <BackEyebrow
            label={upper(backLabel(), locale)}
            fallback={PASS_TAB}
            testID="critters-detail-back"
          />
          <Animated.View style={flipStyle}>
            <CritterDetail
              name={upper(name, locale)}
              tier={form?.rarity ?? 'common'}
              dexNumber={model.no}
              tone={TONE[form?.rarity ?? 'common']}
              sticker={
                <Animated.View style={spinStyle}>
                  {form?.found === true ? (
                    <Sticker
                      kind={artKind(model.key)}
                      name={name}
                      size={HERO_ART}
                      seed={model.seed}
                      {...(form.spec === null ? {} : { form: form.spec })}
                    />
                  ) : (
                    <SilhouetteSlot
                      kind={artKind(model.key)}
                      city={model.city}
                      size={HERO_ART}
                      seed={model.seed}
                      maskColor={tokens.tier.locked.default}
                      glyphColor={tokens.tier.epic.color}
                    />
                  )}
                </Animated.View>
              }
              owners={
                <Row gap="4">
                  {owners.map((owner, index) => (
                    <Avatar key={owner} name={owner} joinIndex={index} size="sm" />
                  ))}
                </Row>
              }
              {...(copy.fieldNote === null
                ? {}
                : { fieldNote: copy.fieldNote, fieldNoteSource: copy.fieldNoteSource })}
              facts={copy.facts(form?.foundAt == null ? null : foundAt(form.foundAt, locale))}
              testID="critters-detail-card"
            />
          </Animated.View>
          <FormSelector
            label={upper(copy.formsLabel, locale)}
            selected={form?.rarity ?? 'common'}
            onSelect={select}
            forms={model.forms.map((f) => ({
              tier: f.rarity,
              found: f.found,
              requirement: f.requirement,
              sticker: f.found ? (
                <Sticker
                  kind={artKind(model.key)}
                  name={f.name ?? name}
                  size={FORM_ART}
                  seed={model.seed}
                  {...(f.spec === null ? {} : { form: f.spec })}
                />
              ) : (
                <SilhouetteSlot
                  kind={artKind(model.key)}
                  city={model.city}
                  size={FORM_ART}
                  seed={model.seed}
                  maskColor={
                    f.rarity === 'legendary'
                      ? tokens.tier.locked.legendary.silhouette
                      : tokens.tier.locked.default
                  }
                  glyphColor={tokens.tier[f.rarity].color}
                />
              ),
            }))}
            testID="critters-detail-forms"
          />
          {nextUnfound === undefined || props.onWhere === undefined ? null : (
            <PillButton
              label={copy.whereToFind(tierWord(nextUnfound.rarity))}
              variant="secondary"
              size="sm"
              block={false}
              tone={PILL[nextUnfound.rarity]}
              onPress={() => props.onWhere?.(nextUnfound.id)}
              testID="critters-detail-where"
            />
          )}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {model.guide === null || form?.found !== true ? (
          <View style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1 }}>
            <PillButton
              label={isSkin ? copy.classicLook : copy.makeGuide}
              variant={isSkin ? 'secondary' : 'primary'}
              tone={PILL[form.rarity]}
              block
              onPress={() => {
                impact(isSkin ? 'tick' : 'success');
                props.onSkin(isSkin ? null : form.id);
              }}
              testID={isSkin ? 'critters-detail-classic' : 'critters-detail-make-guide'}
            />
          </View>
        )}
        {form?.found === true ? (
          <IconButton
            label={copy.share}
            onPress={() => props.onShare(form)}
            glyph={
              <View style={{ transform: [{ rotate: degrees(45) }] }}>
                <StraightArrow direction="up" color={theme.semantic.text.primary} />
              </View>
            }
            testID="critters-detail-share"
          />
        ) : null}
      </View>
    </Scaffold>
  );
}
