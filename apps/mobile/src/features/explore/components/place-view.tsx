/**
 * A place's page, drawn from plain values: the photo to the top edge (pushing in slowly as the
 * page opens) under back, share and save; the guide's and the crew's tags; the name and one line
 * of facts; crowds by the hour; the guide's tip; the crew's line; tickets and tours; and the main
 * action pinned at the bottom beside the guide chat.
 */
import { tokens } from '@cp/design-tokens';
import type { MediaAsset } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Image, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bezierEasing } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { IconButton } from '@/ui/buttons/IconButton';
import { SplitCtaRow } from '@/ui/buttons/SplitCtaRow';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { Row } from '@/ui/layout/Row';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Sticker } from '@/ui/sticker/Sticker';
import { FOOTER_FADE_PT, FooterFade } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import type { LiveDetails } from '../place-live';
import type { GuideFacts } from '../format';
import { AddToDayButton, type AddToDayButtonProps } from './add-to-day-button';
import { CrewRow, type CrewRowProps } from './crew-row';
import { CrowdChart, type CrowdChartProps } from './crowd-chart';
import { GenericPhotoLabel } from './generic-photo-label';
import { PlaceLiveDetails } from './place-live-details';
import { SupplierCard, type SupplierCardProps } from './supplier-card';

const PHOTO_HEIGHT = 320;
const PUSH_IN = 1.08;
const TIP_STICKER = 44;
const pushEasing = bezierEasing(tokens.motion.easing.standard);

export interface PlaceViewProps {
  readonly name: string;
  readonly category: string;
  readonly guide: GuideFacts;
  readonly photo: MediaAsset | null;
  /** A live photo for the hero when the place has none of its own; loaded, never saved. */
  readonly heroUrl?: string | null | undefined;
  /** Foursquare's rating, photos, tips, call, website and attribution, when it has any. */
  readonly live?: LiveDetails | null | undefined;
  /** Already worded, in display order: the guide's pick, whose must-do it is. */
  readonly tags: readonly string[];
  /** Already worded facts, joined with a dot: category, admission, hours, the walk from the stay. */
  readonly meta: readonly string[];
  readonly offline: boolean;
  readonly saved: boolean;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onToggleSave: () => void;
  readonly crowd: CrowdChartProps | null;
  readonly tip: string | null;
  readonly crew: CrewRowProps | null;
  /** Absent while the offers screen is not in the app. */
  readonly offers: SupplierCardProps | null;
  readonly action: AddToDayButtonProps;
  /** Opens the map on this place; absent when its destination is not known. */
  readonly onMap?: (() => void) | undefined;
  /** Opens the guide chat; absent while that screen is not in the app. */
  readonly onChat?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  photo: { height: PHOTO_HEIGHT, overflow: 'hidden', justifyContent: 'flex-end' },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 },
  doodle: { alignItems: 'center', justifyContent: 'center' },
  controls: { position: 'absolute', start: t.space['16'], end: t.space['16'] },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space['6'],
    paddingHorizontal: t.size.gutter,
    paddingBottom: t.space['32'] + t.space['12'],
  },
  tag: {
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
  },
  sheet: {
    marginTop: -t.space['32'],
    borderTopLeftRadius: t.radius.sheetTop,
    borderTopRightRadius: t.radius.sheetTop,
    backgroundColor: t.semantic.bg.base,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['24'],
    gap: t.space['16'],
  },
  footer: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'] },
}));

/** The place photo, pushing in as the page opens; `caption` keeps its credit off covered edges. */
export function PlacePhoto({
  photo,
  heroUrl,
  category,
  accent,
  caption = { at: 'top', inset: 6 },
}: Pick<PlaceViewProps, 'photo' | 'heroUrl' | 'category'> & {
  readonly accent: string;
  readonly caption?: { readonly at: 'top' | 'bottom'; readonly inset: number };
}) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = reduced
      ? 1
      : withTiming(PUSH_IN, { duration: tokens.motion.duration.story, easing: pushEasing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scale is a stable shared value ref.
  }, [reduced]);
  const push = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[styles.fill, push]}>
      <Hatch />
      <MediaLayer
        media={photo}
        surface="dark"
        accent={accent}
        tone="colour"
        dots={false}
        creditAt={caption.at}
        creditInset={caption.inset}
      />
      <GenericPhotoLabel photo={photo} at={caption.at} inset={caption.inset} />
      {photo === null && heroUrl ? (
        <Image
          source={{ uri: heroUrl }}
          style={styles.fill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          testID="explore-place-hero-live"
        />
      ) : photo === null ? (
        <View style={[styles.fill, styles.doodle]}>
          <Icon
            name={categoryIcon(category)}
            size={72}
            color={theme.semantic.text.secondary}
            decorative
          />
        </View>
      ) : null}
    </Animated.View>
  );
}

export function PlaceView(props: PlaceViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const { guide } = props;
  // The round back control on the photo is this page's way back.
  useBackAffordance();
  const chat =
    props.onChat === undefined ? null : (
      <IconButton
        label={t({ id: 'explore.place.chat', message: `Ask ${guide.name} about this place` })}
        icon="chat"
        size={56}
        onPress={props.onChat}
        testID="explore-place-chat"
      />
    );
  const action = <AddToDayButton {...props.action} />;
  return (
    <Scaffold edges={[]} testID="explore-place">
      <ScrollView contentContainerStyle={{ paddingBottom: FOOTER_FADE_PT + theme.space['8'] }}>
        <View style={styles.photo}>
          <PlacePhoto
            photo={props.photo}
            heroUrl={props.heroUrl}
            category={props.category}
            accent={guide.colour}
          />
          <View style={styles.tags} testID="explore-place-tags">
            {props.tags.map((tag, index) => (
              <View
                key={tag}
                style={[
                  styles.tag,
                  { backgroundColor: index === 0 ? guide.colour : theme.color.paper.base },
                ]}
              >
                <Text variant="label" color={theme.semantic.text.onAccent} singleLine={false}>
                  {upper(tag, locale)}
                </Text>
              </View>
            ))}
          </View>
          <Row
            justify="space-between"
            align="center"
            style={[styles.controls, { top: insets.top + theme.space['8'] }]}
          >
            <IconButton
              label={t({ id: 'explore.place.back', message: 'Back' })}
              surface="onPhoto"
              glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
              onPress={props.onBack}
              testID="explore-place-back"
            />
            <Row gap="8">
              <IconButton
                label={t({ id: 'explore.place.share', message: 'Share this place' })}
                surface="onPhoto"
                glyph={<StraightArrow direction="up" color={theme.semantic.text.primary} />}
                onPress={props.onShare}
                testID="explore-place-share"
              />
              <IconButton
                label={
                  props.saved
                    ? t({ id: 'explore.place.unsave', message: 'Remove from saved' })
                    : t({ id: 'explore.place.save', message: 'Save this place' })
                }
                surface="onPhoto"
                glyph={
                  <Icon
                    name="heart"
                    size={22}
                    color={props.saved ? theme.color.pink : theme.semantic.text.primary}
                    {...(props.saved ? {} : { accent: theme.color.ink[850] })}
                    decorative
                  />
                }
                onPress={props.onToggleSave}
                testID={props.saved ? 'explore-place-saved' : 'explore-place-save'}
              />
            </Row>
          </Row>
        </View>
        <View style={styles.sheet}>
          <View style={{ gap: theme.space['8'] }}>
            <Text variant="h1" testID="explore-place-name">
              {upper(props.name, locale)}
            </Text>
            {props.meta.length === 0 ? null : (
              <Text
                variant="body"
                color={theme.semantic.text.secondary}
                testID="explore-place-meta"
              >
                {props.meta.join(' · ')}
              </Text>
            )}
          </View>
          {props.onMap === undefined ? null : (
            <View style={{ alignItems: 'flex-start' }}>
              <TextLink
                label={t({ id: 'explore.place.map', message: 'See it on the map' })}
                onPress={props.onMap}
                testID="explore-place-map"
              />
            </View>
          )}
          {props.offline ? <OfflinePill testID="explore-place-offline" /> : null}
          {props.crowd === null ? null : <CrowdChart {...props.crowd} />}
          {props.tip === null ? null : (
            <Row gap="12" align="center" testID="explore-place-tip">
              <Sticker kind={guide.kind} name={guide.name} size={TIP_STICKER} />
              <View style={{ flex: 1 }}>
                <Text variant="voice" color={guide.colour}>
                  {props.tip}
                </Text>
              </View>
            </Row>
          )}
          {props.live ? <PlaceLiveDetails {...props.live} /> : null}
          {props.crew === null ? null : <CrewRow {...props.crew} />}
          {props.offers === null ? null : <SupplierCard {...props.offers} />}
        </View>
      </ScrollView>
      <FooterFade />
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space['12'] }]}>
        {chat === null ? action : <SplitCtaRow primary={action} secondary={chat} />}
      </View>
    </Scaffold>
  );
}
