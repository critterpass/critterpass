/**
 * The private draft (3c-9) as a pure view: "← {PLACE} SETUP" and ONLY YOU SEE THIS, "{GUIDE}'S
 * DRAFT" with the guide bobbing beside it, the dates and cost each, which must-dos made it, a
 * stale-setup banner, the days, then BUILD THE PROPOSAL, "Ask {guide} to change a day" and the
 * redraft counter. A redraft still waiting on the organiser shows as a banner that opens it.
 */
import { displayWithHome, useMoneyDisplay } from '@/data/money';
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion';
import { guideColour, guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Sticker } from '@/ui/sticker/Sticker';
import { FooterFade, FOOTER_FADE_PT } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { draftBackLabel } from './draft-copy';
import { estimateMinor, estimateMoney, overBudgetMinor, wholeMoney } from '../data/format';
import type { RedraftQuota } from '../data/quota';
import { counterLine } from '../data/quota-copy';
import type { ReviewModel } from '../data/version';
import { ClosureNotes } from './closure-notes';
import { CoverageStrip, LeftOutRows, OverBudget, type MissedMustDo } from './coverage-strip';
import { DraftDayRow } from './draft-day-row';
import { StaleBanner } from './stale-banner';
import { StayRows } from './stay-rows';

const STICKER = 112;

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    // A long back label pushes the pill to its own line; neither is squeezed.
    flexWrap: 'wrap',
    columnGap: th.space['8'],
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: th.space['32'] + th.space['12'],
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['16'] + FOOTER_FADE_PT,
    gap: th.space['12'],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  grow: { flex: 1 },
  days: { backgroundColor: th.semantic.bg.raised, borderRadius: th.radius.lg, overflow: 'hidden' },
  banner: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
  },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

export interface DraftReviewViewProps {
  readonly guide: GuideId;
  readonly destination: string;
  readonly dates: string;
  readonly locale: string;
  readonly model: ReviewModel;
  readonly quota: RedraftQuota;
  readonly offline: boolean;
  /** A redraft waiting on the organiser (running, or delivered and not kept or put back). */
  readonly openRedraft: { readonly dayNo: number | null; readonly ready: boolean } | null;
  readonly hasHistory: boolean;
  readonly onBack: () => void;
  readonly onPropose: (() => void) | undefined;
  readonly onChangeDay: (free: boolean) => void;
  /** Opens the fix for a must-do that did not make the draft. */
  readonly onFixMiss?: ((miss: MissedMustDo) => void) | undefined;
  readonly onOpenDay: ((dayNo: number) => void) | undefined;
  readonly onOpenRedraft: () => void;
  readonly onHistory: () => void;
}

export function DraftReviewView(props: DraftReviewViewProps) {
  const { guide, model, locale, quota, openRedraft } = props;
  useMoneyDisplay();
  const styles = useStyles();
  const theme = useTheme();
  const bob = useLoop('bob');
  const info = guideSticker(guide);
  const guideName = info.name;
  const destination = props.destination;
  const dates = props.dates;
  const cost = displayWithHome(
    estimateMoney(locale, model.costPpMinor, model.currency),
    estimateMinor(model.costPpMinor, model.currency),
    model.currency,
    locale,
  );
  // The target is exact and the cost is shown rounded: the gap is taken from the shown figure.
  const overBy = overBudgetMinor(model.costPpMinor, model.overByMinor, model.currency);
  const counter = counterLine(quota);
  const redraftDay = openRedraft?.dayNo ?? null;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="draft-review">
      <View style={styles.header}>
        <BackEyebrow
          label={draftBackLabel(destination)}
          onPress={props.onBack}
          testID="draft-back"
        />
        <HeaderPill
          tone="private"
          label={t({ id: 'planDraft.onlyYou', message: 'Only you see this' })}
          icon={<Icon name="lock" size={14} decorative color={theme.semantic.text.secondary} />}
          testID="draft-private"
        />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.grow}>
            <Text variant="h1" accessibilityRole="header" testID="draft-title">
              {t({ id: 'planDraft.review.title', message: `${guideName}’s draft` })}
            </Text>
          </View>
          <Animated.View style={bob}>
            <Sticker kind={info.kind} name={info.name} size={STICKER} />
          </Animated.View>
        </View>
        <Text variant="body" color={theme.semantic.text.secondary} testID="draft-sub">
          {model.costPpMinor > 0
            ? t({
                id: 'planDraft.review.sub',
                message: `${dates}, ${cost} each. Fix anything before the crew sees it.`,
              })
            : // Nothing in the draft is priced: say so, never "0 each".
              t({
                id: 'planDraft.review.subNoCost',
                message: `${dates}. No cost estimate yet. Fix anything before the crew sees it.`,
              })}
        </Text>
        {props.offline ? <OfflinePill /> : null}
        {openRedraft === null ? null : (
          <View style={styles.banner} testID="draft-open-redraft">
            <View style={styles.grow}>
              <Text variant="bodySm">
                {openRedraft.ready
                  ? redraftDay === null
                    ? t({ id: 'planDraft.review.redraftReady', message: 'Your redraft is ready.' })
                    : t({
                        id: 'planDraft.review.redraftReadyDay',
                        message: `Day ${redraftDay}, redrafted, is ready.`,
                      })
                  : t({
                      id: 'planDraft.review.redrafting',
                      message: `${guideName} is redrafting a day.`,
                    })}
              </Text>
            </View>
            <TextLink
              label={t({ id: 'planDraft.review.redraftOpen', message: 'Open' })}
              onPress={props.onOpenRedraft}
              testID="draft-open-redraft-go"
            />
          </View>
        )}
        {model.stale.length > 0 ? (
          <StaleBanner
            changes={model.stale}
            locale={locale}
            free={model.lateMustDo}
            onRedraft={() => props.onChangeDay(model.lateMustDo)}
          />
        ) : null}
        <CoverageStrip model={model.mustDos} onFix={props.onFixMiss} />
        <LeftOutRows rows={model.leftOut ?? []} />
        {overBy > 0 ? <OverBudget amount={wholeMoney(locale, overBy, model.currency)} /> : null}
        <View style={styles.days} testID="draft-days">
          {model.days.map((day, index) => (
            <DraftDayRow
              key={day.dayNo}
              day={day}
              index={index}
              locale={locale}
              colour={guideColour(guide)}
              onPress={
                props.onOpenDay === undefined ? undefined : () => props.onOpenDay?.(day.dayNo)
              }
            />
          ))}
        </View>
        <StayRows stays={model.stays} locale={locale} />
        <ClosureNotes closures={model.closures} locale={locale} />
        {props.hasHistory ? (
          <TextLink
            label={t({ id: 'planDraft.review.history', message: 'Earlier drafts' })}
            onPress={props.onHistory}
            testID="draft-history-open"
          />
        ) : null}
      </ScrollView>
      <FooterFade />
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'planDraft.review.propose', message: 'Build the proposal' })}
          onPress={() => props.onPropose?.()}
          disabled={props.onPropose === undefined}
          sheen
          testID="draft-propose"
        />
        <TextLink
          label={t({
            id: 'planDraft.review.changeDay',
            message: `Ask ${guideName} to change a day`,
          })}
          onPress={() => props.onChangeDay(false)}
          disabled={openRedraft !== null}
          testID="draft-change-day"
        />
        {counter === null ? null : (
          <Text variant="caption" color={theme.semantic.text.tertiary} testID="draft-counter">
            {counter}
          </Text>
        )}
      </View>
    </Scaffold>
  );
}
