/**
 * The recap page (8.09): the dates and crew, "Bali, the recap" with the guide cheering, four
 * tilted stat tiles, the forms card (found forms as stickers, the one that got away as a gold
 * silhouette, the guide's line about it), the award tiles, Share recap and Where next?, then the
 * album, the postcard, rating the trip and playing the story again. While it is written, failed
 * or loading, a state in the guide's voice. The recap's ways out are its own buttons and back.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import {
  Button,
  CritterSticker,
  GlassIconButton,
  OfflinePill,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { artKind, formSpec } from '../data/critter-art';
import { awardDetail, awardTitle } from '../summary/award-copy';
import {
  formsCount,
  formsEyebrow,
  gotAwayLine,
  headerEyebrow,
  headerTitle,
  tileCopy,
  updatedBadge,
} from '../summary/summary-copy';
import type { SummaryViewProps } from '../summary/summary-view';
import { TILE_TILTS } from './recap-paint';
import { NextLink, NotReady } from './recap-parts';

const useStyles = makePremiumStyles((th) => ({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    flexGrow: 1,
    height: 148,
    padding: 14,
    borderRadius: 24,
    justifyContent: 'space-between',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  card: {
    padding: 14,
    gap: 12,
    borderRadius: 24,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  forms: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  awards: { flexDirection: 'row', gap: 10 },
  award: {
    flex: 1,
    padding: 12,
    gap: 2,
    borderRadius: 18,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

function Ready(props: SummaryViewProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const locale = useLocale();
  const { model, unit, guideName } = props;
  const forms = model.forms;
  const gotAway = model.gotAway;
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.tiles}>
        {model.tiles.slice(0, 4).map((tile, index) => {
          const copy = tileCopy(tile, locale, unit);
          return (
            <View
              key={tile.id}
              style={[styles.tile, { transform: [{ rotate: `${TILE_TILTS[index] ?? 0}deg` }] }]}
              accessible
              accessibilityLabel={`${copy.value}, ${copy.caption}`}
              testID={`recap-tile-${tile.id}`}
            >
              <Text variant="stat" numberOfLines={1}>
                {copy.value}
              </Text>
              <Text variant="captionMuted" tone="muted" numberOfLines={2}>
                {copy.caption}
              </Text>
            </View>
          );
        })}
      </View>
      {forms === null ? null : (
        <PressableScale
          style={styles.card}
          onPress={props.onGotAway}
          disabled={props.onGotAway === undefined}
          accessibilityRole="button"
          testID="recap-forms"
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label">{formsEyebrow(forms.kind, gotAway?.name ?? null)}</Text>
            <Text variant="label" tone="muted">
              {formsCount(forms.found, forms.total, forms.kind)}
            </Text>
          </View>
          <View style={styles.forms}>
            {forms.forms.map((form) => {
              const kind = artKind(form.row.critter_key);
              const seed = form.row.canonical_seed ?? undefined;
              const city = form.row.city ?? '';
              const spec = formSpec(form.row);
              return form.found ? (
                <CritterSticker
                  key={form.id}
                  kind={kind}
                  name={city}
                  size={60}
                  pose="cheer"
                  {...(spec === null ? {} : { form: spec })}
                  {...(seed === undefined ? {} : { seed })}
                />
              ) : (
                <View key={form.id} testID={form.gotAway ? 'recap-forms-got-away' : undefined}>
                  <CritterSticker
                    kind={kind}
                    name={city}
                    size={60}
                    variant="mask"
                    maskColor={form.gotAway ? th.color.lockedMaskGold : th.color.lockedMask}
                    {...(seed === undefined ? {} : { seed })}
                  />
                </View>
              );
            })}
          </View>
          {gotAway === null ? null : (
            <Text variant="guide" color={th.color.status.maybe.text} testID="recap-got-away-line">
              {gotAwayLine(gotAway)}
            </Text>
          )}
        </PressableScale>
      )}
      {model.awards.length === 0 ? null : (
        <View style={styles.awards}>
          {model.awards.slice(0, 2).map((chip) => (
            <View key={chip.id} style={styles.award} testID={`recap-award-${chip.id}`}>
              <Text variant="captionMuted" tone="muted">
                {chip.title ?? awardTitle(chip.kind)}
              </Text>
              <Text variant="rowTextStrong">{awardDetail(chip)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1.3 }}>
          <Button
            label={t({ id: 'recap.summary.share', message: 'Share recap' })}
            onPress={props.onShare}
            testID="recap-share"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            label={t({ id: 'recap.summary.whereNext', message: 'Where next? →' })}
            onPress={props.onWhereNext}
            testID="recap-where-next"
          />
        </View>
      </View>
      {props.onPhotos === undefined ? null : (
        <NextLink
          title={t({ id: 'recap.summary.photos', message: 'Photos' })}
          detail={t({
            id: 'recap.summary.photosDetail',
            message: "The crew's album, with the picks",
          })}
          onPress={props.onPhotos}
          testID="recap-photos"
        />
      )}
      {props.onPostcard === undefined ? null : (
        <NextLink
          title={t({ id: 'recap.summary.postcard', message: 'Send a postcard' })}
          detail={t({
            id: 'recap.summary.postcardDetail',
            message: 'One photo and a note, to the crew',
          })}
          onPress={props.onPostcard}
          testID="recap-postcard"
        />
      )}
      {props.onRate === undefined ? null : (
        <NextLink
          title={t({ id: 'recap.summary.rate', message: 'Rate the trip' })}
          detail={t({
            id: 'recap.summary.rateDetail',
            message: 'One tap a place, for the next crew',
          })}
          onPress={props.onRate}
          testID="recap-rate"
        />
      )}
      {props.onWatch === undefined ? null : (
        <NextLink
          title={t({ id: 'recap.summary.watch', message: 'Play the story again' })}
          detail={t({
            id: 'recap.summary.watchDetail',
            message: `${guideName} tells it from the start`,
          })}
          onPress={props.onWatch}
          testID="recap-watch"
        />
      )}
    </View>
  );
}

export function PremiumRecapScene(props: SummaryViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { model } = props;
  const art = guideSticker(props.guide);
  return (
    <View style={{ flex: 1, backgroundColor: th.color.ground }} testID="recap-summary">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 6,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
          gap: 16,
        }}
      >
        <GlassIconButton
          icon="back"
          label={t({ id: 'recap.summary.back', message: 'Back' })}
          onPress={props.onBack}
          testID="recap-back"
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="label" tone="muted" testID="recap-eyebrow">
              {headerEyebrow(model, locale)}
            </Text>
            <Text variant="display" accessibilityRole="header" testID="recap-title">
              {headerTitle(model)}
            </Text>
          </View>
          <View style={{ transform: [{ rotate: `${GUIDE_TILT}deg` }] }}>
            <CritterSticker kind={art.kind} name={props.guideName} size={78} pose="cheer" />
          </View>
        </View>
        {props.offline ? (
          <OfflinePill label={t({ id: 'recap.summary.offline', message: 'No signal' })} />
        ) : null}
        {model.updated === null ? null : (
          <Text variant="captionMuted" tone="muted" testID="recap-updated">
            {updatedBadge(model.updated)}
          </Text>
        )}
        {model.dropout ? (
          <Text variant="captionMuted" tone="muted" testID="recap-dropout">
            {t({ id: 'recap.summary.dropout', message: 'You sat this one out' })}
          </Text>
        ) : null}
        {model.phase === 'ready' ? <Ready {...props} /> : <NotReady {...props} />}
      </ScrollView>
    </View>
  );
}

/** The cheering guide's tilt, as drawn. */
const GUIDE_TILT = 8;
