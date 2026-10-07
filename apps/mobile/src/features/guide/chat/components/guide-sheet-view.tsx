/**
 * The guide sheet's frame (3j-1): it rises over the current screen with the guide's header, the
 * thread scrolling under it, the quick actions (only those switched on; the row reflows) and the
 * composer ("Ask, or hold to talk") at the foot. The 4b-1 limit swaps the composer for its
 * countdown bar.
 */
import { useLingui } from '@lingui/react/macro';
import { useRef, type ReactNode } from 'react';
import { ScrollView as HorizontalScroll } from 'react-native';

import { Stack, Text, makeStyles, sizeToken } from '@/ui';
import { Composer } from '@/ui/chat/Composer';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

export interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface GuideSheetViewProps {
  readonly header: ReactNode;
  readonly conversation: ReactNode;
  readonly quickActions: readonly QuickAction[];
  /** Replaces the composer (the 4b-1 countdown bar). */
  readonly composerSlot?: ReactNode;
  readonly draft: string;
  readonly onDraft: (text: string) => void;
  readonly onSend: () => void;
  readonly onAttach?: () => void;
  readonly onMic?: () => void;
  /** The microphone was held: voice mode opens already listening. Defaults to `onMic`. */
  readonly onMicHold?: () => void;
}

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['16'] },
  actions: { gap: t.space['8'], paddingHorizontal: t.size.gutter },
  // 3j-1's quick actions: filled dark pills with bold caps (the small button type).
  action: {
    minHeight: sizeToken(t.size.chip, 'hitTarget'),
    borderRadius: sizeToken(t.size.chip, 'hitTarget') / 2,
    paddingHorizontal: t.space['14'],
    backgroundColor: t.semantic.bg.control,
    justifyContent: 'center',
  },
  // The quick actions scroll edge to edge (their row insets its content); the composer keeps the
  // crew chat's inset, so the two bars sit in the same place.
  foot: { paddingTop: t.space['8'], gap: t.space['12'] },
  composer: { paddingHorizontal: t.space['12'] },
}));

export function GuideSheetView(props: GuideSheetViewProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const scroll = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void }>(null);
  return (
    <Sheet
      detents={['large']}
      header={props.header}
      closable={false}
      accessibilityLabel={t({ id: 'guide.sheet.label', message: 'Guide chat' })}
      testID="guide-sheet"
    >
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        // The latest line stays in view as the thread grows.
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        // React 19 passes `ref` as a prop, through to the scroll view.
        {...({ ref: scroll } as object)}
      >
        <Stack style={styles.body}>{props.conversation}</Stack>
      </SheetScrollView>
      <Stack style={styles.foot}>
        {props.quickActions.length === 0 ? null : (
          <HorizontalScroll
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actions}
            testID="guide-quick-actions"
          >
            {props.quickActions.map((action) => (
              <PressScale
                key={action.id}
                accessibilityLabel={action.label}
                onPress={action.onPress}
                widthClass="narrow"
                style={styles.action}
                testID={`guide-quick-${action.id}`}
              >
                <Text variant="buttonSm">{action.label}</Text>
              </PressScale>
            ))}
          </HorizontalScroll>
        )}
        {props.composerSlot ?? (
          <Stack style={styles.composer}>
            <Composer
              value={props.draft}
              onChangeText={props.onDraft}
              onSend={props.onSend}
              placeholder={t({ id: 'guide.composer.placeholder', message: 'Ask, or hold to talk' })}
              {...(props.onAttach === undefined ? {} : { onAttach: props.onAttach })}
              {...(props.onMic === undefined
                ? {}
                : { onMicTap: props.onMic, onHoldStart: props.onMicHold ?? props.onMic })}
              onRaised
              testID="guide-composer"
            />
          </Stack>
        )}
      </Stack>
    </Sheet>
  );
}
