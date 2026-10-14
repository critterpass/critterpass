/**
 * What every premium setup step page shares (4.10–4.17): the page with its centred title and a
 * fixed footer, the checklist pill ("SETUP CHECKLIST · 1 OF 7 · Dates · Then any order"), and the
 * step's headline with its line.
 */
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLingui } from '@lingui/react/macro';

import { Card, Text, usePremiumTheme } from '@/ui/premium';
import {
  FooterStack,
  PushScreen,
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useScrollEdges,
} from '@/ui/premium/shell';

import { CHECKLIST_ROWS, type ChecklistRowKey } from '../../data/checklist';
import { rowTitle } from '../checklist/copy';
import { StatusDisc } from '../checklist/checklist-parts';

export function StepPage(props: {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const edges = useScrollEdges();
  return (
    <PushScreen
      title={props.title}
      {...(props.subtitle === undefined ? {} : { subtitle: props.subtitle })}
      backLabel={t({ id: 'setup.premium.back', message: 'Back' })}
      scroll={false}
      testID={props.testID}
    >
      <ScrollView
        {...edges.scrollProps}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: theme.space.gap16,
          paddingTop: theme.space.gap8,
          // The last card scrolls clear of the footer's fade.
          paddingBottom: props.footer == null ? theme.space.gap16 : SCROLL_EDGE_FADE,
          gap: theme.space.gap16,
        }}
      >
        {props.children}
      </ScrollView>
      {props.footer === undefined || props.footer === null ? null : (
        <FooterStack
          gap={theme.space.gap4}
          style={{
            paddingHorizontal: theme.space.titleGutter,
            paddingTop: theme.space.gap8,
            paddingBottom: insets.bottom + theme.space.gap12,
          }}
        >
          {/* The page fades out above the footer instead of ending in a hard cut across a card. */}
          <View pointerEvents="none" style={styles.aboveFooter}>
            <ScrollEdgeFade edge="bottom" height={SCROLL_EDGE_FADE} visible={edges.bottom} />
          </View>
          {props.footer}
        </FooterStack>
      )}
    </PushScreen>
  );
}

export function ChecklistPill(props: {
  readonly row: ChecklistRowKey;
  readonly done: boolean;
  readonly trailing: string;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const position = CHECKLIST_ROWS.indexOf(props.row) + 1;
  const total = CHECKLIST_ROWS.length;
  return (
    <Card
      style={{
        height: 62,
        borderRadius: theme.radius.banner,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap12,
        paddingHorizontal: theme.space.rowPadH,
      }}
      testID="setup-checklist-pill"
    >
      <StatusDisc state={props.done ? 'done' : 'mine'} />
      <View style={{ flex: 1 }}>
        <Text variant="badge" tone="muted">
          {t({
            id: 'setup.premium.pill.eyebrow',
            message: `Setup checklist · ${position} of ${total}`,
          }).toLocaleUpperCase()}
        </Text>
        <Text variant="headline">{rowTitle(props.row)}</Text>
      </View>
      <Text variant="caption" tone="muted">
        {props.trailing}
      </Text>
    </Card>
  );
}

export function StepHeadline(props: { readonly title: string; readonly line?: string | null }) {
  const theme = usePremiumTheme();
  return (
    <View style={{ gap: theme.space.gap6, paddingHorizontal: theme.space.gap8 }}>
      <Text variant="display" accessibilityRole="header">
        {props.title}
      </Text>
      {props.line == null ? null : (
        <Text variant="body" tone="muted">
          {props.line}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  aboveFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    height: SCROLL_EDGE_FADE,
  },
});
