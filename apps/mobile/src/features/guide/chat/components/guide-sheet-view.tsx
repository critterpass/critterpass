/**
 * The guide sheet's frame (3j-1): it rises over the current screen with the guide's header, the
 * thread scrolling under it, the quick actions (only those switched on; the row reflows) and the
 * composer ("Ask, or hold to talk") at the foot. The 4b-1 limit swaps the composer for its
 * countdown bar.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, type ReactNode } from 'react';
import { ScrollView as HorizontalScroll } from 'react-native';

import { upper } from '@cp/i18n';

import { Stack, makeStyles } from '@/ui';
import { Composer } from '@/ui/chat/Composer';
import { QuickActionChip } from '@/ui/chips/QuickActionChip';
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
  /** Changes whenever the thread grows, to keep the latest line in view. */
  readonly scrollKey: string;
}

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['16'] },
  actions: { gap: t.space['8'], paddingHorizontal: t.size.gutter },
  foot: { paddingHorizontal: t.size.gutter, paddingTop: t.space['8'], gap: t.space['12'] },
}));

export function GuideSheetView(props: GuideSheetViewProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const scroll = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void }>(null);
  useEffect(() => {
    scroll.current?.scrollToEnd({ animated: true });
  }, [props.scrollKey]);
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
              <QuickActionChip
                key={action.id}
                label={upper(action.label, i18n.locale)}
                onPress={action.onPress}
                testID={`guide-quick-${action.id}`}
              />
            ))}
          </HorizontalScroll>
        )}
        {props.composerSlot ?? (
          <Composer
            value={props.draft}
            onChangeText={props.onDraft}
            onSend={props.onSend}
            placeholder={t({ id: 'guide.composer.placeholder', message: 'Ask, or hold to talk' })}
            {...(props.onAttach === undefined ? {} : { onAttach: props.onAttach })}
            {...(props.onMic === undefined
              ? {}
              : { onMicTap: props.onMic, onHoldStart: props.onMic })}
            testID="guide-composer"
          />
        )}
      </Stack>
    </Sheet>
  );
}
