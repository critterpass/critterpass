/**
 * The guide drafting (4.20, slow 4.21) in the premium look: the guide floating in its tint, "Pon is
 * drafting your 8 days" and what to expect, the steps in the job's real order (done in mint with a
 * check, the running one ringed and bold, the rest waiting at .45), and the days as stickers as
 * they are sketched. Every state has a way out: come back later or stop while it runs, try again
 * when it failed. When the result has shown long enough the page fades and the draft opens.
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  CritterSticker,
  GlassIconButton,
  ListCard,
  OfflinePill,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { VISIBLE_STEP_IDS } from '../../draft/data/job';
import { lineFor, titleFor, type DraftingViewProps } from '../../draft/drafting/drafting-props';
import { failLine, stepLine } from '../../draft/drafting/step-copy';
import { draftingBackLabel } from '../../draft/review/draft-copy';
import { DayStickers, StepMark } from './drafting-parts';
import { confirmAlert } from '@/ui/premium/shell';

/** The status bar band the scrolled page fades under. */
const TOP_FADE = 12;

export function PremiumDraftingView({
  guide,
  days,
  phase,
  steps,
  dayCards,
  leaving,
  onDone,
  onRetry,
  onCancel,
  onBack,
  testID = 'drafting-screen',
}: DraftingViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const sticker = guideSticker(guide);
  const rows = steps.filter((row) => (VISIBLE_STEP_IDS as readonly string[]).includes(row.id));
  const working = phase.kind === 'running' || phase.kind === 'starting' || phase.kind === 'done';
  const slow = phase.kind === 'running' && phase.slow;
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(onDone, 250);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);
  if (leaving) return <View style={{ flex: 1, backgroundColor: theme.color.ground }} />;
  return (
    <Animated.View
      exiting={FadeOut}
      style={{ flex: 1, backgroundColor: theme.color.ground }}
      testID={testID}
    >
      {slow ? (
        <View
          style={{
            paddingTop: insets.top + theme.space.gap4,
            paddingHorizontal: theme.space.gutter,
          }}
        >
          <GlassIconButton
            icon="close"
            label={draftingBackLabel()}
            onPress={onBack}
            testID="drafting-close"
          />
        </View>
      ) : null}
      <ScrollView
        contentContainerStyle={{
          paddingTop: slow ? theme.space.gap16 : insets.top + theme.space.gap16 * 3,
          paddingHorizontal: theme.space.gutter,
          paddingBottom: theme.space.gap16,
          gap: theme.space.gap16,
          alignItems: 'stretch',
          // A short page sits in the middle of the room above the buttons, not at its top with a
          // dead band under it.
          flexGrow: 1,
          justifyContent: 'center',
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 180,
              height: 180,
              borderRadius: 90,
              backgroundColor: theme.color.status.tangerine.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CritterSticker kind={sticker.kind} name={sticker.name} size={140} />
          </View>
        </View>
        <View style={{ gap: theme.space.gap8, alignItems: 'center' }}>
          {phase.kind === 'offline' ? <OfflinePill /> : null}
          <Text variant="display" align="center" accessibilityRole="header" testID="drafting-title">
            {slow
              ? t({
                  id: 'plan.premium.drafting.slowTitle',
                  message: 'Taking a bit longer than usual',
                })
              : titleFor(phase, sticker.name, days)}
          </Text>
          <Text
            variant="body"
            tone="muted"
            align="center"
            accessibilityLiveRegion="polite"
            testID="drafting-line"
          >
            {lineFor(phase, days)}
          </Text>
        </View>
        {phase.kind === 'blocked' || rows.length === 0 ? null : (
          <ListCard>
            {rows.map((row) => (
              <View
                key={row.id}
                testID={`drafting-step-${row.id}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  paddingVertical: 9,
                  paddingHorizontal: theme.space.gap16,
                  opacity: row.status === 'pending' ? 0.45 : 1,
                }}
              >
                <StepMark status={row.status} />
                <View style={{ flex: 1 }}>
                  <Text variant={row.status === 'running' ? 'rowTextStrong' : 'rowText'}>
                    {stepLine(row)}
                  </Text>
                  {row.status === 'failed' ? (
                    <Text variant="caption" color={theme.color.destructive.text}>
                      {failLine(row.reason)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </ListCard>
        )}
        {working && dayCards.length > 0 ? <DayStickers days={dayCards} locale={locale} /> : null}
      </ScrollView>
      {slow ? null : (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top + TOP_FADE,
            // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, never copy.
            experimental_backgroundImage: `linear-gradient(180deg, ${theme.color.ground} ${String(Math.round((insets.top / (insets.top + TOP_FADE)) * 100))}%, ${theme.color.ground}00)`,
          }}
        />
      )}
      <View
        style={{
          paddingHorizontal: theme.space.titleGutter,
          paddingBottom: insets.bottom + theme.space.gap16,
          gap: theme.space.gap4,
          alignItems: 'center',
        }}
      >
        {phase.kind === 'failed' || phase.kind === 'cancelled' ? (
          <>
            <View style={{ alignSelf: 'stretch' }}>
              <Button
                label={
                  phase.kind === 'failed'
                    ? t({ id: 'planDraft.drafting.retry', message: 'Try again' })
                    : t({ id: 'planDraft.drafting.again', message: 'Draft again' })
                }
                onPress={onRetry}
                testID="drafting-retry"
              />
            </View>
            <TextButton label={draftingBackLabel()} onPress={onBack} testID="drafting-back" />
          </>
        ) : phase.kind === 'blocked' ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Button label={draftingBackLabel()} onPress={onBack} testID="drafting-back" />
          </View>
        ) : phase.kind === 'done' ? null : (
          <>
            <View style={{ alignSelf: 'stretch' }}>
              <Button
                label={
                  slow
                    ? t({ id: 'plan.premium.drafting.ping', message: 'Ping me when it’s ready' })
                    : t({ id: 'planDraft.drafting.leave', message: 'Come back later' })
                }
                variant={slow ? 'primary' : 'secondary'}
                onPress={onBack}
                testID="drafting-leave"
              />
            </View>
            {phase.kind === 'offline' ? null : (
              <TextButton
                label={t({ id: 'plan.premium.drafting.cancel', message: 'Cancel the draft' })}
                onPress={() =>
                  void confirmAlert({
                    title: t({
                      id: 'plan.premium.drafting.cancelTitle',
                      message: 'Cancel the draft?',
                    }),
                    message: t({
                      id: 'planDraft.drafting.stopped',
                      message: 'Nobody saw it. Start again whenever you like.',
                    }),
                    confirm: t({
                      id: 'plan.premium.drafting.cancelConfirm',
                      message: 'Cancel draft',
                    }),
                    cancel: t({ id: 'plan.premium.drafting.keep', message: 'Keep drafting' }),
                  }).then((yes) => {
                    if (yes) onCancel();
                  })
                }
                testID="drafting-cancel"
              />
            )}
          </>
        )}
      </View>
    </Animated.View>
  );
}
