/**
 * The hub's header (3k-1), one block from the top of the screen: the dates and who's going
 * ("OCT 12–19 · 6 GOING") with SWITCH TRIP beside it when there is another trip; the
 * destination in the display face in the guide's colour; and the phase's line, on the
 * destination's baseline: a 1 Hz countdown before the trip ("Wheels up in 17D 05:26:29") or on a
 * travel day ("Land in"), "Day 4 of 8" during it, "Home since Oct 19" after, or the planning CTA
 * while the trip is still being planned. A called-off trip keeps its dates and name and says so,
 * with nothing counted. A name too long to share its line takes the whole width
 * and the phase's line sits under it. Behind it all, the destination's photo under an ink scrim;
 * with a photo the header is taller, the photo showing between the dates line and the
 * destination; with none it is plain ink.
 */
import { tokens } from '@cp/design-tokens';
import type { MediaAsset } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFor } from '@/lib/fonts';
import { useLocale } from '@/lib/i18n/use-locale';
import { useThemeSettings } from '@/lib/theme';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { HeroBackdrop } from './hero-backdrop';
import {
  baselineLift,
  COUNTDOWN_SIZE,
  countdownBeside,
  countdownSize,
  labelHeight,
  MEDIA_WINDOW,
  TITLE_GAP,
  titleLineSize,
} from './hero-layout';
import { tripDates } from './hub-copy';
import type { HubHeader } from './hub-model';
import { usePhaseLine } from './phase-line';

export interface PhaseHeaderProps {
  readonly header: HubHeader;
  /** A fixed clock for the countdown (design scenes); left out, the header reads its own. */
  readonly now?: Date;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly going: number;
  readonly destination: string;
  readonly colour: string;
  /** The destination photo behind the header; null keeps the plain dark header. */
  readonly media?: MediaAsset | null;
  readonly mediaLowData?: boolean;
  /** The planning block: a state line, a button, or both. */
  readonly planning: {
    readonly note?: string | undefined;
    readonly label?: string | undefined;
    readonly onPress?: (() => void) | undefined;
  } | null;
  /** Active crew members: before the trip is locked the header counts the crew, not seats. */
  readonly crewSize?: number | undefined;
  /** Another trip to go to: the SWITCH TRIP pill. */
  readonly onSwitch: (() => void) | null;
  /** The destination has no checked picks yet: the guide says so under the destination. */
  readonly guestGuideName: string | null;
}

const useStyles = makeStyles((th) => ({
  hero: { paddingHorizontal: th.size.gutter },
  meta: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: TITLE_GAP },
  // A name with no stacked marks needs no room above its capitals: the row makes that room
  // itself and takes it back, so the name sits right under the dates line, as designed.
  tight: { paddingTop: th.space['32'], marginTop: -th.space['32'] },
  title: { flex: 1 },
  // The label hangs above the countdown, out of the row's flow, wide enough for a longer label.
  sideLabel: { position: 'absolute', end: 0, start: -th.size.gutter * 4 },
  sideLabelText: { textAlign: 'right' },
  under: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: th.space['8'],
    marginTop: th.space['4'],
  },
  below: { marginTop: th.space['12'], alignItems: 'flex-start' },
}));

/** Vietnamese letters with marks above (Ặ, Ỗ, Ế…), which rise past the capitals' height. */
const STACKED_MARKS = /[\u1EA0-\u1EF9]/u;

export function PhaseHeader(props: PhaseHeaderProps) {
  const locale = useLocale();
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { fontScale } = useThemeSettings();
  const [titleY, setTitleY] = useState(0);
  const { header } = props;
  const media = props.media ?? null;
  const cream = theme.semantic.text.primary;
  const dates = props.startDate === null ? null : tripDates(locale, props.startDate, props.endDate);
  const count = props.going;
  const crew = props.crewSize;
  // Nobody is "going" until the crew has answered: while planning, the crew is who is here.
  const going =
    header.phase === 'planning' && crew !== undefined
      ? t({ id: 'trip.hub.inCrew', message: `${crew} in the crew` })
      : t({ id: 'trip.hub.going', message: `${count} going` });
  // Each part keeps its words together, so a line too long for the row breaks after the dot.
  const meta = upper(
    [dates, header.phase === 'cancelled' ? null : going]
      .filter((part) => part !== null)
      .map((part) => part.replaceAll(' ', '\u00a0'))
      .join(' · ')
      .replace(' · ', '\u00a0· '),
    locale,
  );
  const title = upper(props.destination, locale);
  const line = usePhaseLine(header, props.now);
  const label = line === null ? null : upper(line.label, locale);
  const value = line === null ? null : upper(line.value, locale);
  const titleLine =
    label === null || value === null
      ? null
      : { title, label, value, width: width - theme.size.gutter * 2, fontScale };
  const beside = titleLine !== null && countdownBeside(titleLine);
  const marks = STACKED_MARKS.test(title);
  const heroToken = tokens.type.display.hero;
  const titleLeading = fontFor(
    {
      fontFamily: heroToken.fontFamily,
      fontWeight: heroToken.fontWeight,
      ...(heroToken.widthStepMin === undefined ? {} : { widthStep: heroToken.widthStepMin }),
      lineHeightMultiplier: heroToken.lineHeight,
      condensed: heroToken.condensed,
    },
    marks ? 'vi' : locale,
  ).lineHeightMultiplier;
  const lift =
    titleLine === null
      ? 0
      : baselineLift({
          titleSize: titleLineSize(titleLine),
          titleLeading,
          valueSize: countdownSize(fontScale),
        });
  const paddingTop = insets.top + theme.space['8'];
  // A licence credit sits in the bottom corner, under the content.
  const paddingBottom = media?.attribution_required ? theme.space['24'] : theme.space['12'];
  const guideName = props.guestGuideName;
  const timer =
    label === null || value === null
      ? null
      : ({
          accessible: true,
          accessibilityRole: 'timer',
          accessibilityLabel: `${label} ${value}`,
        } as const);
  const countdown =
    value === null ? null : (
      <Text
        variant="h3"
        designSize={COUNTDOWN_SIZE}
        color={cream}
        style={{ fontVariant: ['tabular-nums'] }}
        testID="trip-hub-countdown"
      >
        {value}
      </Text>
    );
  return (
    <View
      style={[styles.hero, { paddingTop, paddingBottom }]}
      testID={`trip-hub-header-${header.phase}`}
    >
      <HeroBackdrop
        media={media}
        colour={props.colour}
        lowData={props.mediaLowData ?? false}
        titleY={titleY}
      />
      <Row justify="space-between" align="center" gap="12">
        <Text variant="eyebrow" color={cream} style={styles.meta} testID="trip-hub-meta">
          {meta}
        </Text>
        {props.onSwitch === null ? null : (
          <InlineAction
            label={upper(t({ id: 'trip.hub.switch', message: 'Switch trip' }), locale)}
            onPress={props.onSwitch}
            testID="trip-hub-switch"
          />
        )}
      </Row>
      <View
        style={[
          styles.titleRow,
          marks ? null : styles.tight,
          media === null ? null : { marginTop: (marks ? 0 : -theme.space['32']) + MEDIA_WINDOW },
        ]}
        onLayout={(event) =>
          setTitleY(event.nativeEvent.layout.y + (marks ? 0 : theme.space['32']))
        }
      >
        <Text variant="displayHero" autoFit color={props.colour} style={styles.title}>
          {title}
        </Text>
        {beside && timer !== null ? (
          <View style={{ marginBottom: lift }} {...timer}>
            <View style={[styles.sideLabel, { top: -(labelHeight(fontScale) + theme.space['2']) }]}>
              <Text variant="eyebrow" color={cream} numberOfLines={1} style={styles.sideLabelText}>
                {label}
              </Text>
            </View>
            {countdown}
          </View>
        ) : null}
      </View>
      {!beside && timer !== null ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' }} {...timer}>
          <Text variant="eyebrow" color={cream} style={{ marginEnd: theme.space['8'] }}>
            {label}
          </Text>
          {countdown}
        </View>
      ) : null}
      {guideName === null ? null : (
        <View style={styles.below}>
          <InfoPill>
            {t({
              id: 'trip.hub.learningGuide',
              message: `${guideName} is still learning · picks unchecked`,
            })}
          </InfoPill>
        </View>
      )}
      {header.phase === 'cancelled' ? (
        <View style={styles.below}>
          <InfoPill testID="trip-hub-called-off">
            {t({ id: 'trip.hub.calledOff', message: 'Called off' })}
          </InfoPill>
        </View>
      ) : null}
      {header.phase === 'planning' && props.planning !== null ? (
        <View style={{ marginTop: theme.space['12'], gap: theme.space['12'] }}>
          {props.planning.note === undefined ? null : (
            <Text variant="body" color={cream} singleLine={false} testID="trip-hub-planning-note">
              {props.planning.note}
            </Text>
          )}
          {props.planning.label === undefined || props.planning.onPress === undefined ? null : (
            <PillButton
              label={props.planning.label}
              tone="yellow"
              onPress={props.planning.onPress}
              testID="trip-hub-planning-cta"
            />
          )}
        </View>
      ) : null}
    </View>
  );
}
