/**
 * The planning place page (7e-1), drawn from plain values: the photo to the top edge under back,
 * share and ♡; the sheet rising over it with the category, who saved it and a split; the name and
 * one meta line; the fact tiles; WHEN IT FITS; the crew's line; then what lies further down; and
 * the button that always says where the place would go, beside the guide chat.
 */
import { upper } from '@cp/i18n';
import type { PlaceMediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { I18nManager, Pressable, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GoButton } from '@/ui/buttons/GoButton';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { SplitCtaRow } from '@/ui/buttons/SplitCtaRow';
import { Icon } from '@/ui/icons/Icon';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { Row } from '@/ui/layout/Row';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { FOOTER_FADE_PT, FooterFade } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles, useTheme } from '@/ui/theme';

import { categoryLabel } from '../category';
import { CrewRow, type CrewRowProps } from '../components/crew-row';
import { PlacePhoto } from '../components/place-view';
import type { GuideFacts } from '../format';
import { CATEGORY_ACCENT } from './category-accent';
import { CollapsingHeader } from './collapsing-header';
import type { FactTiles } from './context';
import { FactTileRow } from './fact-tiles';
import { WhenItFits, type WhenItFitsProps } from './when-it-fits';

export const DETAIL_PHOTO_HEIGHT = 300;

export interface PlaceDetailViewProps {
  readonly name: string;
  readonly category: string;
  readonly guide: GuideFacts;
  readonly photo: PlaceMediaAsset | null;
  readonly heroUrl: string | null;
  readonly saved: boolean;
  readonly offline: boolean;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onToggleSave: () => void;
  /** "SAVED BY ALEX + RIN". */
  readonly savedBy: string | null;
  /** "CREW SPLIT 2–2", opening the split. */
  readonly split: { readonly label: string; readonly onPress: (() => void) | undefined } | null;
  readonly meta: readonly string[];
  readonly facts: FactTiles | null;
  readonly fits: Omit<WhenItFitsProps, 'guide'> | null;
  /** What the page says when there is no fit to show (no trip, hours not known). */
  readonly fitNote: string | null;
  readonly crew: CrewRowProps | null;
  /** 7e-2: the tip, what to know, nearby, similar and the kept live and partner blocks. */
  readonly further: ReactNode;
  readonly cta: {
    readonly label: string;
    readonly tone: 'yellow' | 'green';
    readonly disabled: boolean;
    readonly busy: boolean;
    readonly onPress: () => void;
  };
  readonly onChat?: (() => void) | undefined;
  /** GO: the route from here, then directions in the maps app. */
  readonly onGo?: (() => void) | undefined;
}

const useStyles = makeStyles((t) => ({
  photo: { height: DETAIL_PHOTO_HEIGHT, overflow: 'hidden' },
  controls: { position: 'absolute', start: t.space['16'], end: t.space['16'] },
  sheet: {
    marginTop: -t.space['32'],
    borderTopLeftRadius: t.radius.sheetTop,
    borderTopRightRadius: t.radius.sheetTop,
    backgroundColor: t.semantic.bg.base,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['20'],
    gap: t.space['14'],
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['6'] },
  tag: {
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['4'],
    minHeight: 24,
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'] },
}));

function Tag({
  label,
  fill,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly fill: string;
  readonly onPress?: (() => void) | undefined;
  readonly testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  const body = (
    <View style={[styles.tag, { backgroundColor: fill }]}>
      <Text variant="label" color={theme.semantic.text.onAccent}>
        {upper(label, i18n.locale)}
      </Text>
    </View>
  );
  return onPress === undefined ? (
    <View testID={testID}>{body}</View>
  ) : (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={10} testID={testID}>
      {body}
    </Pressable>
  );
}

export function PlaceDetailView(props: PlaceDetailViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  useBackAffordance();
  const swatch = theme.color[CATEGORY_ACCENT[props.category] ?? 'blue'];
  const accent = typeof swatch === 'string' ? swatch : swatch.base;
  const heart = (
    <Icon
      name="heart"
      size={22}
      color={props.saved ? theme.color.pink : theme.semantic.text.primary}
      accent={props.saved ? theme.color.pink : theme.color.ink[850]}
      decorative
    />
  );
  const saveLabel = props.saved
    ? t({ id: 'explore.detail.unsave', message: 'Remove from Ideas' })
    : t({ id: 'explore.detail.save', message: 'Save to Ideas' });
  const cta = (
    <PillButton
      label={props.cta.label}
      tone={props.cta.tone}
      flap
      loading={props.cta.busy}
      disabled={props.cta.disabled}
      onPress={props.cta.onPress}
      testID="place-detail-cta"
    />
  );
  const chat =
    props.onChat === undefined ? null : (
      <IconButton
        label={t({
          id: 'explore.detail.chat',
          message: `Ask ${props.guide.name} about this place`,
        })}
        icon="chat"
        size={56}
        onPress={props.onChat}
        testID="place-detail-chat"
      />
    );
  return (
    <Scaffold edges={[]} testID="place-detail">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: FOOTER_FADE_PT + theme.space['8'] }}
        testID="place-detail-scroll"
      >
        <View style={styles.photo}>
          <PlacePhoto
            photo={props.photo}
            heroUrl={props.heroUrl}
            category={props.category}
            accent={props.guide.colour}
            // The status bar and the buttons cover the top, the sheet the last 32 pt.
            caption={{ at: 'bottom', inset: theme.space['32'] + theme.space['6'] }}
          />
          <Row
            justify="space-between"
            align="center"
            style={[styles.controls, { top: insets.top + theme.space['8'] }]}
            pointerEvents="box-none"
          >
            <IconButton
              label={t({ id: 'explore.detail.back', message: 'Back' })}
              surface="onPhoto"
              glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
              onPress={props.onBack}
              testID="place-detail-back"
            />
            <Row gap="8">
              <IconButton
                label={t({ id: 'explore.detail.share', message: 'Share this place' })}
                surface="onPhoto"
                glyph={
                  // Up and out, as the design's share glyph: the plain arrow turned 45°.
                  <View style={{ transform: [{ rotate: degrees(I18nManager.isRTL ? -45 : 45) }] }}>
                    <StraightArrow direction="up" color={theme.semantic.text.primary} />
                  </View>
                }
                onPress={props.onShare}
                testID="place-detail-share"
              />
              <IconButton
                label={saveLabel}
                surface="onPhoto"
                glyph={heart}
                onPress={props.onToggleSave}
                testID={props.saved ? 'place-detail-saved' : 'place-detail-save'}
              />
            </Row>
          </Row>
        </View>
        <View style={styles.sheet}>
          <View style={styles.tags} testID="place-detail-tags">
            <Tag
              label={categoryLabel(props.category)}
              fill={accent}
              testID="place-detail-category"
            />
            {props.savedBy === null ? null : (
              <Tag
                label={props.savedBy}
                fill={theme.color.paper.base}
                testID="place-detail-saved-by"
              />
            )}
            {props.split === null ? null : (
              <Tag
                label={props.split.label}
                fill={theme.color.pink}
                onPress={props.split.onPress}
                testID="place-detail-split"
              />
            )}
          </View>
          <View style={{ gap: theme.space['6'] }}>
            <Text variant="h1" testID="place-detail-name">
              {upper(props.name, locale)}
            </Text>
            {props.meta.length === 0 ? null : (
              <Text variant="body" color={theme.semantic.text.secondary} testID="place-detail-meta">
                {props.meta.join(' · ')}
              </Text>
            )}
          </View>
          {props.onGo === undefined ? null : (
            <GoButton onPress={props.onGo} testID="place-detail-go" />
          )}
          {props.offline ? <OfflinePill testID="place-detail-offline" /> : null}
          {props.facts === null ? null : <FactTileRow facts={props.facts} />}
          {props.fits === null ? null : <WhenItFits guide={props.guide} {...props.fits} />}
          {props.fitNote === null ? null : (
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              testID="place-detail-fit-note"
            >
              {props.fitNote}
            </Text>
          )}
          {props.crew === null ? null : <CrewRow {...props.crew} />}
          {props.further}
        </View>
      </Animated.ScrollView>
      <CollapsingHeader
        scrollY={scrollY}
        threshold={DETAIL_PHOTO_HEIGHT - theme.space['32']}
        title={props.name}
        onBack={props.onBack}
        saveLabel={saveLabel}
        heart={heart}
        onToggleSave={props.onToggleSave}
      />
      <FooterFade />
      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space['12'] }]}>
        {chat === null ? cta : <SplitCtaRow primary={cta} secondary={chat} />}
      </View>
    </Scaffold>
  );
}
