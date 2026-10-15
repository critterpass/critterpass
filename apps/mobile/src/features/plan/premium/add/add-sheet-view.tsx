/**
 * Add to plan in the premium look (4.39), the sheet over the map: "Add Tirta Empul" with the ✕,
 * the guide's line, the trip's days as chips with a fit dot each (green fits, tangerine possible,
 * grey no; the chosen day in ink), the day's header, the block in its day, "Why 08:00" as four
 * tiles, who's going, and the foot: "Add to Sat 17 · 08:00" (Suggest for a member) and "Just save
 * it for later".
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  IconButton,
  PressableScale,
  ScrollRow,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { FooterStack, sheetMaterialStyle } from '@/ui/premium/shell';

import type { AddSheetViewProps } from '../../add/add-look';
import { Doodle } from '@/features/explore';
import { dayInk } from '../map';

const CHIP_W = 48;
const CHIP_H = 50;

export function PremiumAddSheetView(props: AddSheetViewProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const fitColour = (fit: string | undefined) =>
    fit === 'good'
      ? theme.color.toggleOn
      : fit === 'possible'
        ? theme.accent.tangerine
        : fit === 'no'
          ? theme.color.outlineEmpty
          : null;
  const chosen = props.days.find((day) => day.dayNo === props.dayNo);
  return (
    <View style={[{ flex: 1 }, sheetMaterialStyle(theme)]} testID="plan-add-sheet">
      {/* The body sits in its own plain view, as the kit's sheet screen does: a native form sheet
          adopts the first scroll view it finds as its own, and adopted bare it opened blank, with
          only the footer showing. */}
      <View collapsable={false} style={{ flex: 1, overflow: 'hidden' }}>
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{
            paddingHorizontal: theme.space.gap16,
            paddingTop: theme.space.gap16,
            paddingBottom: theme.space.gap16,
            gap: theme.space.gap12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap10 }}>
            <Text variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={2}>
              {t({ id: 'plan.premium.add.title', message: `Add ${props.name}` })}
            </Text>
            <IconButton
              icon="close"
              size={32}
              tone="control"
              label={t({ id: 'plan.premium.add.close', message: 'Close' })}
              onPress={() => router.back()}
              testID="plan-add-close"
            />
          </View>
          {props.line === '' ? null : (
            <Text variant="body" tone="muted">
              {props.line}
            </Text>
          )}
          {props.days.length === 0 ? null : (
            <ScrollRow gap={theme.space.gap6} bleed={theme.space.gap16}>
              {props.days.map((day) => {
                const on = day.dayNo === props.dayNo;
                const dot = fitColour(day.fit);
                return (
                  <PressableScale
                    key={day.dayNo}
                    onPress={() => props.onDay(day.dayNo)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={day.accessibilityLabel ?? day.weekday}
                    testID={`plan-add-day-${String(day.dayNo)}`}
                    style={{
                      width: CHIP_W,
                      height: CHIP_H,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? theme.color.ink : theme.color.card,
                      ...(on ? {} : { boxShadow: theme.shadow.float }),
                      opacity: day.dimmed === true ? 0.5 : 1,
                    }}
                  >
                    <Text variant="badge" tone={on ? 'onInk' : 'ink'} style={{ opacity: 0.7 }}>
                      {day.weekday}
                    </Text>
                    <Text variant="headline" tone={on ? 'onInk' : 'ink'}>
                      {day.dateLabel ?? String(day.dayNo)}
                    </Text>
                    {dot === null ? null : (
                      <View
                        style={{
                          position: 'absolute',
                          top: 5,
                          right: 5,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          borderWidth: 1.5,
                          borderColor: on ? theme.color.ink : theme.color.card,
                          backgroundColor: dot,
                        }}
                      />
                    )}
                  </PressableScale>
                );
              })}
            </ScrollRow>
          )}
          {props.guidePick == null ? null : (
            <TextButton
              label={props.guidePick.label}
              onPress={props.guidePick.onPress}
              testID="plan-add-guide-pick"
            />
          )}
          {props.dayHeader === '' ? null : (
            <Text
              variant="badge"
              color={chosen === undefined ? theme.color.muted : dayInk(chosen.dayNo, theme.scheme)}
            >
              {props.dayHeader.toLocaleUpperCase()}
            </Text>
          )}
          {props.block}
          {props.useStart == null ? null : (
            <TextButton
              label={t({
                id: 'plan.premium.add.useStart',
                message: `Start at ${props.useStart.time} instead`,
              })}
              onPress={props.useStart.onPress}
              testID="plan-add-use-start"
            />
          )}
          {props.note === null ? null : (
            <Text variant="caption" tone="muted" testID="plan-add-note">
              {props.note}
            </Text>
          )}
          {props.reasons.length === 0 ? null : (
            <View style={{ gap: theme.space.gap6 }}>
              <Text variant="label" tone="muted">
                {props.whyTitle}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap6 }}>
                {props.reasons.map((reason) => (
                  <View
                    key={reason.key}
                    style={{
                      width: '48.5%',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.space.gap6,
                      borderRadius: 14,
                      backgroundColor: theme.color.ground,
                      paddingVertical: 9,
                      paddingHorizontal: 11,
                    }}
                  >
                    <Doodle name={reason.icon} size={22} />
                    <Text variant="captionMuted" style={{ flex: 1 }}>
                      {reason.text}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {props.who}
        </ScrollView>
      </View>
      <FooterStack
        gap={theme.space.gap4}
        style={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          paddingBottom: Math.max(insets.bottom, theme.space.gap16),
        }}
      >
        {props.voteNote == null ? null : (
          <Text variant="caption" tone="muted" align="center">
            {props.voteNote}
          </Text>
        )}
        <View style={{ alignSelf: 'stretch' }}>
          <Button
            label={props.cta}
            onPress={props.onAdd}
            disabled={props.disabled}
            loading={props.busy}
            testID="plan-add-confirm"
          />
        </View>
        {props.onSaveLater === null ? null : (
          <TextButton
            align="center"
            label={t({ id: 'plan.add.saveLater', message: 'Just save it for later' })}
            onPress={props.onSaveLater}
            testID="plan-add-save-later"
          />
        )}
      </FooterStack>
    </View>
  );
}
